import type { INestApplication } from '@nestjs/common';
import { ErrorCodes } from '@ping/shared';
import { randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { RedisProvider } from '../src/infra/redis/redis.module.js';
import { LoginAttemptsService } from '../src/modules/auth/login-attempts.service.js';
import { bootApp } from './helpers/boot.js';

/**
 * Chống lạm dụng (hướng dẫn 16.5, ADR-0027): khóa tạm khi đăng nhập sai, chống flood tin nhắn,
 * giới hạn event/kết nối/kích thước gói của Socket.IO. Chạy trên app thật, Postgres + Redis thật.
 */
const runId = Date.now().toString(36);
const PASSWORD = 'password123';

describe('abuse limits (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisProvider;
  let port: number;
  const emails: string[] = [];
  const sockets: Socket[] = [];

  const http = () => request(app.getHttpServer());
  const api = (path: string) => `/api/v1${path}`;
  const login = (email: string, password: string) =>
    http().post(api('/auth/login')).send({ email, password });
  async function registerUser(label: string) {
    const email = `abuse-${label}-${runId}@ping.dev`;
    emails.push(email);
    const res = await http()
      .post(api('/auth/register'))
      .send({ email, username: `ab${label}${runId}`.slice(0, 32), password: PASSWORD })
      .expect(201);
    return { email, id: res.body.user.id as string, token: res.body.accessToken as string };
  }

  beforeAll(async () => {
    app = await bootApp({ websocket: true });
    ({ port } = app.getHttpServer().address() as AddressInfo);
    prisma = app.get(PrismaService);
    redis = app.get(RedisProvider);
  });
  afterAll(async () => {
    sockets.forEach((socket) => socket.close());
    const users = await prisma.user.findMany({
      where: { email: { in: emails } },
      select: { id: true },
    });
    const ids = users.map((user) => user.id);
    await prisma.message.deleteMany({ where: { authorId: { in: ids } } });
    await prisma.server.deleteMany({ where: { ownerId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  describe('password guessing', () => {
    it('locks an account after 5 wrong passwords from one client: even the right password gets 429', async () => {
      await redis.flushdb();
      const user = await registerUser('lock');
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await login(user.email, 'wrong-password').expect(401);
      }
      const blocked = await login(user.email, PASSWORD);
      expect(blocked.status).toBe(429);
      expect(blocked.body.code).toBe(ErrorCodes.TOO_MANY_REQUESTS);
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    });

    it('treats an unknown email exactly like a real one (no account enumeration)', async () => {
      await redis.flushdb();
      const email = `ghost-${runId}@ping.dev`;
      const statuses: number[] = [];
      for (let attempt = 0; attempt < 6; attempt += 1) {
        statuses.push((await login(email, 'wrong-password')).status);
      }
      expect(statuses).toEqual([401, 401, 401, 401, 401, 429]);
    });

    it('a successful login clears the counter; other accounts are never affected', async () => {
      await redis.flushdb();
      const user = await registerUser('reset');
      const other = await registerUser('other');
      for (let attempt = 0; attempt < 4; attempt += 1) {
        await login(user.email, 'wrong-password').expect(401);
      }
      await login(user.email, PASSWORD).expect(200);
      for (let attempt = 0; attempt < 4; attempt += 1) {
        await login(user.email, 'wrong-password').expect(401); // chưa bị khóa: bộ đếm đã về 0
      }
      await login(other.email, PASSWORD).expect(200);
    });

    it('locks an account after 20 failures spread across different IPs', async () => {
      await redis.flushdb();
      const attempts = app.get(LoginAttemptsService);
      const email = `spread-${runId}@ping.dev`;
      for (let ip = 1; ip <= 20; ip += 1) {
        await attempts.recordFailure(email, `10.0.0.${ip}`);
      }
      await expect(attempts.assertAllowed(email, '10.9.9.9')).rejects.toMatchObject({
        status: 429,
      });
      await expect(
        attempts.assertAllowed(`calm-${runId}@ping.dev`, '10.9.9.9'),
      ).resolves.toBeUndefined();
    });

    it('never stores the email in clear text in Redis keys', async () => {
      await redis.flushdb();
      const email = `plain-${runId}@ping.dev`;
      await login(email, 'wrong-password').expect(401);
      const keys = await redis.keys('*');
      expect(keys.some((key) => key.includes('loginfail'))).toBe(true);
      expect(keys.some((key) => key.includes(email) || key.includes('plain-'))).toBe(false);
    });
  });

  describe('message flood', () => {
    it('allows 10 messages per 10 seconds per user per channel, then 429; other channels unaffected', async () => {
      await redis.flushdb();
      const user = await registerUser('flood');
      const server = await http()
        .post(api('/servers'))
        .set('Authorization', `Bearer ${user.token}`)
        .send({ name: 'flood' })
        .expect(201);
      const channelId = server.body.channels[0].id as string;
      const second = await http()
        .post(api(`/servers/${server.body.id}/channels`))
        .set('Authorization', `Bearer ${user.token}`)
        .send({ name: 'second' })
        .expect(201);
      const send = (channel: string) =>
        http()
          .post(api(`/channels/${channel}/messages`))
          .set('Authorization', `Bearer ${user.token}`)
          .send({ content: 'spam', nonce: randomUUID() });

      for (let count = 0; count < 10; count += 1) {
        expect((await send(channelId)).status).toBe(201);
      }
      const blocked = await send(channelId);
      expect(blocked.status).toBe(429);
      expect(blocked.body.code).toBe(ErrorCodes.TOO_MANY_REQUESTS);
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
      expect((await send(second.body.id as string)).status).toBe(201);
    });

    it('does not block messaging when Redis is down (fail-open, rule 17)', async () => {
      const down = await bootApp({ deadRedis: true });
      try {
        const user = await registerUser('floodopen');
        const server = await http()
          .post(api('/servers'))
          .set('Authorization', `Bearer ${user.token}`)
          .send({ name: 'floodopen' })
          .expect(201);
        const channelId = server.body.channels[0].id as string;
        for (let count = 0; count < 12; count += 1) {
          const res = await request(down.getHttpServer())
            .post(api(`/channels/${channelId}/messages`))
            .set('Authorization', `Bearer ${user.token}`)
            .send({ content: 'still works', nonce: randomUUID() });
          expect(res.status).toBe(201);
        }
      } finally {
        await down.close();
      }
    });
  });

  describe('sockets', () => {
    const connect = (token: string) =>
      new Promise<Socket>((resolve, reject) => {
        const socket = io(`http://127.0.0.1:${port}`, {
          transports: ['websocket'],
          auth: { token },
          reconnection: false,
        });
        sockets.push(socket);
        socket.once('connect', () => resolve(socket));
        socket.once('connect_error', reject);
      });
    const disconnected = (socket: Socket, ms = 3000) =>
      new Promise<boolean>((resolve) => {
        if (socket.disconnected) return resolve(true);
        const timer = setTimeout(() => resolve(false), ms);
        socket.once('disconnect', () => {
          clearTimeout(timer);
          resolve(true);
        });
      });

    it('allows at most 10 simultaneous sockets per user; the 11th is dropped', async () => {
      await redis.flushdb();
      const user = await registerUser('conn');
      const open: Socket[] = [];
      for (let count = 0; count < 10; count += 1) open.push(await connect(user.token));
      await new Promise((resolve) => setTimeout(resolve, 300));
      expect(open.every((socket) => socket.connected)).toBe(true);

      const eleventh = await connect(user.token).catch(() => undefined);
      if (eleventh) expect(await disconnected(eleventh)).toBe(true);
      expect(open.every((socket) => socket.connected)).toBe(true); // socket cũ không bị ảnh hưởng
    });

    it('drops a socket that floods events (typing is already rate-limited, the flood is not)', async () => {
      await redis.flushdb();
      const user = await registerUser('evt');
      const socket = await connect(user.token);
      const channelId = randomUUID();
      for (let count = 0; count < 300; count += 1) socket.emit('typing.start', { channelId });
      expect(await disconnected(socket)).toBe(true);
    });

    it('drops a socket that sends a packet over 16 KB (maxHttpBufferSize)', async () => {
      await redis.flushdb();
      const user = await registerUser('big');
      const socket = await connect(user.token);
      socket.emit('typing.start', { channelId: 'x'.repeat(20_000) });
      expect(await disconnected(socket)).toBe(true);
    });

    it('a normal client is not dropped', async () => {
      await redis.flushdb();
      const user = await registerUser('ok');
      const socket = await connect(user.token);
      socket.emit('typing.start', { channelId: randomUUID() });
      await new Promise((resolve) => setTimeout(resolve, 500));
      expect(socket.connected).toBe(true);
    });
  });
});
