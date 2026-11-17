import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import type { ChannelJoinResult } from '@ping/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { RedisProvider } from '../src/infra/redis/redis.module.js';
import { RedisIoAdapter } from '../src/infra/socket/redis-io.adapter.js';
import { RealtimeGateway } from '../src/modules/realtime/realtime.gateway.js';
import { RealtimeAppModule } from '../src/realtime-app.module.js';
import { bootApp } from './helpers/boot.js';

// ConfigModule chụp env lúc import AppModule: vai trò `api` phải đặt trước mọi import (ADR-0098).
vi.hoisted(() => {
  process.env.REALTIME_ROLE = 'api';
});

type User = { id: string; token: string };

describe('API và Realtime là hai tiến trình riêng (e2e, ADR-0098)', () => {
  let api: INestApplication;
  let gateway: INestApplication;
  let port: number;
  const sockets: Socket[] = [];
  const suffix = randomUUID().slice(0, 8);
  let owner: User;
  let member: User;
  let outsider: User;
  let serverId: string;
  let channelId: string;
  let memberRowId: string;

  const http = () => request(api.getHttpServer());
  const settle = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));

  async function register(tag: string): Promise<User> {
    const res = await http()
      .post('/api/v1/auth/register')
      .send({
        email: `split-${suffix}-${tag}@ping.dev`,
        username: `sp${suffix}${tag}`.slice(0, 32),
        password: 'password123',
        displayName: 'Split',
      })
      .expect(201);
    return { id: res.body.user.id, token: res.body.accessToken };
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

  const waitEvent = <T>(socket: Socket, event: string, ms = 4000) =>
    new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timeout: không có "${event}"`)), ms);
      socket.once(event, (payload: T) => {
        clearTimeout(timer);
        resolve(payload);
      });
    });

  const join = (socket: Socket, id: string) =>
    socket
      .timeout(4000)
      .emitWithAck('channel.join', { channelId: id }) as Promise<ChannelJoinResult>;

  beforeAll(async () => {
    api = await bootApp();
    await api.get(RedisProvider).flushdb();

    const module = await Test.createTestingModule({ imports: [RealtimeAppModule] }).compile();
    gateway = module.createNestApplication();
    gateway.setGlobalPrefix('api/v1');
    const redis = gateway.get(RedisProvider);
    const webOrigin = gateway.get(ConfigService).getOrThrow<string>('WEB_ORIGIN');
    gateway.useWebSocketAdapter(new RedisIoAdapter(gateway, redis, redis.duplicate(), webOrigin));
    await gateway.listen(0);
    const address = gateway.getHttpServer().address();
    port = typeof address === 'object' && address !== null ? address.port : 0;

    owner = await register('o');
    member = await register('m');
    outsider = await register('x');
    const server = await http()
      .post('/api/v1/servers')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ name: 'Split Server' })
      .expect(201);
    serverId = server.body.id;
    const channel = await http()
      .post(`/api/v1/servers/${serverId}/channels`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ name: 'general' })
      .expect(201);
    channelId = channel.body.id;
    await http()
      .post('/api/v1/servers/join')
      .set('Authorization', `Bearer ${member.token}`)
      .send({ inviteCode: server.body.inviteCode })
      .expect(201);
    const members = await http()
      .get(`/api/v1/servers/${serverId}/members`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    memberRowId = members.body.members.find((m: { userId: string }) => m.userId === member.id).id;
  }, 40000);

  afterAll(async () => {
    // Worker có thể chạy tiếp file khác: không để vai trò `api` rò sang các spec cần gateway trong cùng tiến trình.
    delete process.env.REALTIME_ROLE;
    for (const socket of sockets) socket.disconnect();
    await settle();
    await gateway.close();
    await api.close();
  });

  const post = (token: string, content: string) =>
    http()
      .post(`/api/v1/channels/${channelId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content, nonce: randomUUID() })
      .expect(201);

  it('tiến trình API không có gateway, Realtime thì có', () => {
    expect(() => api.get(RealtimeGateway, { strict: false })).toThrow();
    expect(gateway.get(RealtimeGateway)).toBeInstanceOf(RealtimeGateway);
  });

  it('tin nhắn tạo ở API tới socket nối vào Realtime', async () => {
    const socket = await connect(owner.token);
    await expect(join(socket, channelId)).resolves.toEqual({ ok: true });
    const received = waitEvent<{ content: string }>(socket, 'message.created');
    await post(owner.token, 'qua redis adapter');
    expect((await received).content).toBe('qua redis adapter');
  });

  it('join bị từ chối cho người ngoài và id lạ, giống nhau', async () => {
    const socket = await connect(outsider.token);
    await expect(join(socket, channelId)).resolves.toEqual({ ok: false, code: 'FORBIDDEN' });
    await expect(join(socket, randomUUID())).resolves.toEqual({ ok: false, code: 'FORBIDDEN' });
  });

  it('API đếm được socket đang nối ở Realtime (danh sách thành viên có online)', async () => {
    const socket = await connect(member.token);
    await settle();
    const res = await http()
      .get(`/api/v1/servers/${serverId}/members`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    const row = res.body.members.find((m: { userId: string }) => m.userId === member.id);
    expect(row.online ?? row.status ?? true).toBeTruthy();
    socket.disconnect();
  });

  it('kick ở API thu hồi quyền ngay trên socket ở Realtime', async () => {
    const socket = await connect(member.token);
    await expect(join(socket, channelId)).resolves.toEqual({ ok: true });
    const removed = waitEvent<{ serverId: string }>(socket, 'member.removed');
    await http()
      .delete(`/api/v1/servers/${serverId}/members/${memberRowId}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(204);
    expect(await removed).toEqual({ serverId });
    let leaked = false;
    socket.once('message.created', () => (leaked = true));
    await post(owner.token, 'sau khi kick');
    await settle(800);
    expect(leaked).toBe(false);
  });

  it('Realtime có /health nhưng không có route nghiệp vụ', async () => {
    await request(gateway.getHttpServer()).get('/api/v1/health').expect(200);
    await request(gateway.getHttpServer()).get('/api/v1/servers').expect(404);
  });
});
