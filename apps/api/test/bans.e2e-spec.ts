import type { INestApplication } from '@nestjs/common';
import { Permissions } from '@ping/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { RedisProvider } from '../src/infra/redis/redis.module.js';
import { bootApp } from './helpers/boot.js';

const runId = Date.now().toString(36);

interface TestUser {
  id: string;
  token: string;
}

type HttpMethod = 'get' | 'post' | 'put' | 'delete';

function waitEvent<T>(socket: Socket, event: string, timeoutMs = 3000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timeout: client không nhận được event "${event}"`));
    }, timeoutMs);
    const handler = (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    };
    socket.once(event, handler);
  });
}

function connectClient(app: INestApplication, token: string): Promise<Socket> {
  const address = app.getHttpServer().address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
  return new Promise((resolve, reject) => {
    const socket = io(`http://127.0.0.1:${port}`, {
      transports: ['websocket'],
      auth: { token },
      reconnection: false,
    });
    sockets.push(socket);
    socket.once('connect', () => resolve(socket));
    socket.once('connect_error', reject);
  });
}

const sockets: Socket[] = [];

describe('Ban/unban member (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const emails: string[] = [];

  let owner: TestUser;
  let mod: TestUser;
  let victim: TestUser;
  let watcher: TestUser;
  let victim2: TestUser;
  let outsider: TestUser;
  let serverA: string;
  let inviteA: string;
  let channelA: string;

  async function registerUser(): Promise<TestUser> {
    const suffix = Math.random().toString(36).slice(2, 8);
    const email = `b-${runId}-${suffix}@ping.dev`;
    emails.push(email);
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, username: `b${runId}${suffix}`.slice(0, 32), password: 'password123' })
      .expect(201);
    return { id: res.body.user.id, token: res.body.accessToken };
  }

  function api(method: HttpMethod, url: string, token: string) {
    return request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);
  }

  async function giveRole(user: TestUser, permissions: bigint) {
    const role = await api('post', `/api/v1/servers/${serverA}/roles`, owner.token)
      .send({ name: `r-${permissions}`, permissions: permissions.toString() })
      .expect(201);
    const members = await api('get', `/api/v1/servers/${serverA}/members`, owner.token).expect(200);
    const memberId = members.body.members.find((m: { userId: string }) => m.userId === user.id).id;
    await api('put', `/api/v1/servers/${serverA}/members/${memberId}/roles`, owner.token)
      .send({ roleIds: [role.body.id] })
      .expect(200);
  }

  const ban = (as: TestUser, body: object) =>
    api('post', `/api/v1/servers/${serverA}/bans`, as.token).send(body);
  const unban = (as: TestUser, userId: string) =>
    api('delete', `/api/v1/servers/${serverA}/bans/${userId}`, as.token);

  beforeAll(async () => {
    app = await bootApp({ websocket: true });
    await app.get(RedisProvider).flushdb();
    prisma = app.get(PrismaService);

    [owner, mod, victim, watcher, victim2] = [
      await registerUser(),
      await registerUser(),
      await registerUser(),
      await registerUser(),
      await registerUser(),
    ];

    const a = await api('post', '/api/v1/servers', owner.token).send({ name: 'A' }).expect(201);
    serverA = a.body.id;
    inviteA = a.body.inviteCode;
    channelA = a.body.channels[0].id;
    for (const user of [mod, victim, watcher, victim2]) {
      await api('post', '/api/v1/servers/join', user.token)
        .send({ inviteCode: inviteA })
        .expect(201);
    }
    await giveRole(mod, Permissions.VIEW_CHANNEL | Permissions.KICK_MEMBERS);
    await giveRole(watcher, Permissions.VIEW_CHANNEL | Permissions.VIEW_AUDIT_LOG);

    // User thứ 6 vượt trần 5/phút của /auth/register: reset bộ đếm Redis rồi đăng ký tiếp.
    await app.get(RedisProvider).flushdb();
    outsider = await registerUser();
    await api('post', '/api/v1/servers', outsider.token).send({ name: 'B' }).expect(201);
  }, 30000);

  afterAll(async () => {
    for (const socket of sockets) {
      socket.disconnect();
    }
    const users = await prisma.user.findMany({
      where: { email: { in: emails } },
      select: { id: true },
    });
    const userIds = users.map((user) => user.id);
    await prisma.auditLog.deleteMany({ where: { serverId: { in: [serverA] } } });
    await prisma.server.deleteMany({ where: { ownerId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it('ban member: mất khỏi danh sách + realtime member.removed(banned) / member.banned + audit', async () => {
    const victimSocket = await connectClient(app, victim.token);
    const watcherSocket = await connectClient(app, watcher.token);
    // Đợi gateway join room (user:<id> + server:<id>) xong.
    await new Promise((resolve) => setTimeout(resolve, 250));

    const removedPromise = waitEvent<{ serverId: string; banned?: boolean }>(
      victimSocket,
      'member.removed',
    );
    const bannedPromise = waitEvent<{ serverId: string; userId: string }>(
      watcherSocket,
      'member.banned',
    );

    const res = await ban(mod, { userId: victim.id, reason: 'spam' }).expect(201);
    expect(res.body).toMatchObject({
      serverId: serverA,
      userId: victim.id,
      reason: 'spam',
      bannedBy: { id: mod.id },
    });

    expect(await removedPromise).toEqual({ serverId: serverA, banned: true });
    expect(await bannedPromise).toEqual({ serverId: serverA, userId: victim.id });

    const members = await api('get', `/api/v1/servers/${serverA}/members`, owner.token).expect(200);
    expect(members.body.members.some((m: { userId: string }) => m.userId === victim.id)).toBe(
      false,
    );

    expect(
      await prisma.auditLog.findMany({ where: { serverId: serverA, action: 'SERVER_BAN' } }),
    ).toEqual([
      expect.objectContaining({
        actorId: mod.id,
        targetId: res.body.id,
        metadata: { userId: victim.id, reason: 'spam' },
      }),
    ]);
    victimSocket.disconnect();
    watcherSocket.disconnect();
  });

  it('người bị ban join lại bằng mã mời → 403 BANNED', async () => {
    const res = await api('post', '/api/v1/servers/join', victim.token)
      .send({ inviteCode: inviteA })
      .expect(403);
    expect(res.body.code).toBe('BANNED');
  });

  it('danh sách ban: đủ shape (user, reason, bannedBy, createdAt), mới nhất trước; member thường → 403', async () => {
    const res = await api('get', `/api/v1/servers/${serverA}/bans`, mod.token).expect(200);
    expect(res.body.hasMore).toBe(false);
    expect(res.body.bans).toHaveLength(1);
    expect(res.body.bans[0]).toMatchObject({
      userId: victim.id,
      reason: 'spam',
      user: { id: victim.id },
      bannedBy: { id: mod.id },
      createdAt: expect.any(String),
    });

    await api('get', `/api/v1/servers/${serverA}/bans`, watcher.token).expect(403);
  });

  it('unban: 204 + audit SERVER_UNBAN + join lại OK', async () => {
    await unban(mod, victim.id).expect(204);

    const bans = await api('get', `/api/v1/servers/${serverA}/bans`, mod.token).expect(200);
    expect(bans.body.bans).toHaveLength(0);

    expect(
      await prisma.auditLog.findMany({ where: { serverId: serverA, action: 'SERVER_UNBAN' } }),
    ).toEqual([
      expect.objectContaining({
        actorId: mod.id,
        metadata: { userId: victim.id },
      }),
    ]);

    await api('post', '/api/v1/servers/join', victim.token)
      .send({ inviteCode: inviteA })
      .expect(201);
  });

  it('unban khi không có lệnh ban → 404', async () => {
    await unban(mod, watcher.id).expect(404);
  });

  it('thứ bậc: member thường không ban được; mod không ban được owner/người mạnh hơn; tự ban → 400; người lạ → 404', async () => {
    await ban(watcher, { userId: owner.id }).expect(403);
    await ban(mod, { userId: owner.id }).expect(403);
    await ban(mod, { userId: watcher.id }).expect(403);
    await ban(mod, { userId: mod.id }).expect(400);
    await ban(mod, { userId: outsider.id }).expect(404);
  });

  it('deleteMessages24h=true: tin 24h gần nhất biến mất khỏi list, tin cũ hơn giữ nguyên, audit đếm đúng', async () => {
    const recent = await api('post', `/api/v1/channels/${channelA}/messages`, victim2.token)
      .send({ content: 'fresh', nonce: randomUUID() })
      .expect(201);
    const old = await api('post', `/api/v1/channels/${channelA}/messages`, victim2.token)
      .send({ content: 'ancient', nonce: randomUUID() })
      .expect(201);
    await prisma.message.update({
      where: { id: old.body.id },
      data: { createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) },
    });

    const res = await ban(mod, { userId: victim2.id, deleteMessages24h: true }).expect(201);
    expect(res.body.reason).toBeNull();

    const list = await api('get', `/api/v1/channels/${channelA}/messages`, mod.token).expect(200);
    const ids = list.body.messages.map((m: { id: string }) => m.id);
    expect(ids).toContain(old.body.id);
    expect(ids).not.toContain(recent.body.id);

    const auditRow = (
      await prisma.auditLog.findMany({
        where: { serverId: serverA, action: 'SERVER_BAN' },
      })
    ).find((row) => (row.metadata as Record<string, unknown>).deletedMessages !== undefined);
    expect(auditRow).toMatchObject({
      actorId: mod.id,
      metadata: { userId: victim2.id, deletedMessages: 1 },
    });
  });

  it('IDOR: chủ server khác không ban/unban/xem danh sách ban của server A được', async () => {
    await ban(outsider, { userId: victim2.id }).expect(403);
    await unban(outsider, victim2.id).expect(403);
    await api('get', `/api/v1/servers/${serverA}/bans`, outsider.token).expect(403);
  });
});
