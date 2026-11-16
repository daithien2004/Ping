import type { INestApplication } from '@nestjs/common';
import { ErrorCodes, type MemberPage, type PresenceWatchResult } from '@ping/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { RedisProvider } from '../src/infra/redis/redis.module.js';
import { bootApp } from './helpers/boot.js';

// ConfigModule chụp env lúc import AppModule nên phải đặt trước mọi import.
vi.hoisted(() => {
  process.env.PRESENCE_SCOPED = 'true';
});

type User = { id: string; token: string };
type Presence = { userId: string; status: 'online' | 'offline' };

describe('presence scoped to watched members (e2e, ADR-0091)', () => {
  let app: INestApplication;
  let port: number;
  const sockets: Socket[] = [];
  const suffix = randomUUID().slice(0, 8);
  let serverId: string;
  let owner: User;
  let friend: User;
  let peer: User;
  let other: User;
  let stranger: User;

  const api = () => request(app.getHttpServer());
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  async function register(name: string): Promise<User> {
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

  function connect(token: string): Promise<Socket & { presence: Presence[] }> {
    return new Promise((resolve, reject) => {
      const socket = io(`http://127.0.0.1:${port}`, {
        transports: ['websocket'],
        auth: { token },
        reconnection: false,
      }) as Socket & { presence: Presence[] };
      socket.presence = [];
      socket.on('presence.updated', (payload: Presence) => socket.presence.push(payload));
      sockets.push(socket);
      socket.once('connect', () => resolve(socket));
      socket.once('connect_error', reject);
    });
  }

  const watch = (socket: Socket, userIds: string[], id = serverId) =>
    socket.emitWithAck('presence.watch', { serverId: id, userIds }) as Promise<PresenceWatchResult>;

  async function until(check: () => boolean) {
    for (let i = 0; i < 40 && !check(); i++) await sleep(50);
    expect(check()).toBe(true);
  }

  async function join(user: User, inviteCode: string) {
    await api()
      .post('/api/v1/servers/join')
      .set('Authorization', `Bearer ${user.token}`)
      .send({ inviteCode })
      .expect(201);
  }

  beforeAll(async () => {
    app = await bootApp({ websocket: true });
    await app.get(RedisProvider).flushdb();
    const address = app.getHttpServer().address();
    port = typeof address === 'object' && address !== null ? address.port : 0;
    [owner, friend, peer, other, stranger] = await Promise.all(
      ['own', 'frd', 'prr', 'oth', 'str'].map(register),
    );
    const created = await api()
      .post('/api/v1/servers')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ name: 'PresenceScope' })
      .expect(201);
    serverId = created.body.id;
    for (const user of [friend, peer, other]) await join(user, created.body.inviteCode);
  }, 30000);

  afterAll(async () => {
    for (const socket of sockets) socket.disconnect();
    // Hạn mức đăng ký 5/phút theo IP dùng chung giữa các spec: trả lại để spec chạy sau không dính 429.
    await app.get(RedisProvider).flushdb();
    await app.close();
  });

  it('delivers presence only for watched members and returns who is online now', async () => {
    await connect(friend.token);
    const watcher = await connect(owner.token);

    const result = await watch(watcher, [friend.id, peer.id]);
    expect(result).toEqual({ ok: true, online: [friend.id] });

    const peerSocket = await connect(peer.token);
    await until(() => watcher.presence.some((p) => p.userId === peer.id && p.status === 'online'));

    await connect(other.token);
    await sleep(300);
    expect(watcher.presence.map((p) => p.userId)).not.toContain(other.id);

    peerSocket.disconnect();
    await until(() => watcher.presence.some((p) => p.userId === peer.id && p.status === 'offline'));
  });

  it('stops delivering after presence.unwatch', async () => {
    const watcher = await connect(owner.token);
    await watch(watcher, [peer.id]);
    watcher.emit('presence.unwatch', { userIds: [peer.id] });
    await sleep(100);

    const peerSocket = await connect(peer.token);
    await sleep(300);
    expect(watcher.presence).toEqual([]);
    peerSocket.disconnect();
  });

  it('refuses someone who is not a member of the server', async () => {
    const outsider = await connect(stranger.token);
    expect(await watch(outsider, [friend.id])).toEqual({ ok: false, code: ErrorCodes.FORBIDDEN });
  });

  it('ignores ids that are not members of that server instead of revealing them', async () => {
    const watcher = await connect(owner.token);
    expect(await watch(watcher, [stranger.id])).toEqual({ ok: true, online: [] });

    await connect(stranger.token);
    await sleep(300);
    expect(watcher.presence.map((p) => p.userId)).not.toContain(stranger.id);
  });

  it('rejects an invalid payload', async () => {
    const watcher = await connect(owner.token);
    const result = (await watcher.emitWithAck('presence.watch', {
      serverId,
      userIds: [],
    })) as PresenceWatchResult;
    expect(result).toEqual({ ok: false, code: ErrorCodes.VALIDATION_ERROR });
  });

  it('a member who is kicked stops receiving presence of the server members', async () => {
    const kicked = await connect(other.token);
    expect(await watch(kicked, [peer.id])).toMatchObject({ ok: true });

    const members = await api()
      .get(`/api/v1/servers/${serverId}/members`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    const target = (members.body as MemberPage).members.find((m) => m.userId === other.id);
    await api()
      .delete(`/api/v1/servers/${serverId}/members/${target?.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(204);
    await sleep(300);
    kicked.presence.length = 0;

    const peerSocket = await connect(peer.token);
    await sleep(300);
    expect(kicked.presence).toEqual([]);
    peerSocket.disconnect();
  });
});
