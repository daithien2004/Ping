import type { INestApplication } from '@nestjs/common';
import type { MemberPage } from '@ping/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RedisProvider } from '../src/infra/redis/redis.module.js';
import { bootApp } from './helpers/boot.js';

// H10 (ADR-0030): GET /servers/:id/members báo từng thành viên đang online hay không, tính từ các
// socket đang mở (room user:<id>) ở MỌI instance; Redis chết thì chỉ đếm instance này, không 500.
describe('members presence snapshot (e2e)', () => {
  let app: INestApplication;
  let port: number;
  const sockets: Socket[] = [];
  const suffix = randomUUID().slice(0, 8);
  let serverId: string;
  let owner: { id: string; token: string };
  let friend: { id: string; token: string };
  let stranger: { id: string; token: string };

  const api = () => request(app.getHttpServer());

  async function register(name: string) {
    const res = await api()
      .post('/api/v1/auth/register')
      .send({
        email: `${name}-${suffix}@ping.dev`,
        username: `${name}_${suffix}`,
        password: 'password123',
        displayName: name,
      })
      .expect(201);
    return { id: res.body.user.id as string, token: res.body.accessToken as string };
  }

  function connect(token: string): Promise<Socket> {
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

  async function members(token: string, id = serverId) {
    const res = await api()
      .get(`/api/v1/servers/${id}/members`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    return (res.body as MemberPage).members;
  }
  const onlineOf = (list: Awaited<ReturnType<typeof members>>, userId: string) =>
    list.find((m) => m.userId === userId)?.online;

  beforeAll(async () => {
    app = await bootApp({ websocket: true });
    await app.get(RedisProvider).flushdb(); // bộ đếm rate limit của spec khác
    const address = app.getHttpServer().address();
    port = typeof address === 'object' && address !== null ? address.port : 0;
    owner = await register('own');
    friend = await register('frd');
    stranger = await register('str');
    const created = await api()
      .post('/api/v1/servers')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ name: 'Presence' })
      .expect(201);
    serverId = created.body.id;
    await api()
      .post('/api/v1/servers/join')
      .set('Authorization', `Bearer ${friend.token}`)
      .send({ inviteCode: created.body.inviteCode })
      .expect(201);
  }, 30000);

  afterAll(async () => {
    for (const socket of sockets) socket.disconnect();
    await app.close();
  });

  it('marks members online only while they hold an open socket', async () => {
    expect(onlineOf(await members(owner.token), friend.id)).toBe(false);

    const socket = await connect(friend.token);
    expect(onlineOf(await members(owner.token), friend.id)).toBe(true);
    expect(onlineOf(await members(owner.token), owner.id)).toBe(false); // owner chưa mở socket

    const closed = new Promise<void>((resolve) => socket.once('disconnect', () => resolve()));
    socket.disconnect();
    await closed;
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(onlineOf(await members(owner.token), friend.id)).toBe(false);
  });

  it('does not reveal presence to someone outside the server', async () => {
    await connect(friend.token);
    await api()
      .get(`/api/v1/servers/${serverId}/members`)
      .set('Authorization', `Bearer ${stranger.token}`)
      .expect(403);
  });
});
