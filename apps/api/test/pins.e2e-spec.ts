import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Limits } from '@ping/shared';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { RedisProvider } from '../src/infra/redis/redis.module.js';
import { RedisIoAdapter } from '../src/infra/socket/redis-io.adapter.js';

const runId = Date.now().toString(36);

interface TestUser {
  id: string;
  token: string;
}

type HttpMethod = 'get' | 'post' | 'patch' | 'put' | 'delete';

/**
 * TG.3 (ADR-0066): ghim tin — idempotent, trần 50/channel (kể cả hai request đồng thời), quyền
 * MANAGE_MESSAGES, audit MESSAGE_PIN/MESSAGE_UNPIN, event realtime và tương tác với xóa mềm.
 */
describe('Pinned messages (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisProvider;
  let port = 0;
  const emails: string[] = [];
  const sockets: Socket[] = [];

  let owner: TestUser;
  let member: TestUser;
  let serverId = '';
  let channelId = '';

  const uniqueSuffix = () => Math.random().toString(36).slice(2, 8);

  async function registerUser(): Promise<TestUser> {
    const email = `pin-${runId}-${uniqueSuffix()}@ping.dev`;
    const username = `p${runId}${uniqueSuffix()}`.slice(0, 32);
    emails.push(email);
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, username, password: 'password123', displayName: 'Pin' })
      .expect(201);
    return { id: res.body.user.id, token: res.body.accessToken };
  }

  function api(method: HttpMethod, url: string, token?: string) {
    const agent = request(app.getHttpServer());
    const call = {
      get: () => agent.get(url),
      post: () => agent.post(url),
      patch: () => agent.patch(url),
      put: () => agent.put(url),
      delete: () => agent.delete(url),
    }[method]();
    return token ? call.set('Authorization', `Bearer ${token}`) : call;
  }

  const pinUrl = (messageId: string) => `/api/v1/messages/${messageId}/pin`;
  const pinsUrl = () => `/api/v1/channels/${channelId}/pins`;

  async function postMessage(token: string, content = 'hello'): Promise<string> {
    const res = await api('post', `/api/v1/channels/${channelId}/messages`, token)
      .send({ content, nonce: randomUUID() })
      .expect(201);
    return res.body.id;
  }

  /** Tin đã ghim thẳng trong DB — nhanh hơn gọi API 49 lần khi kiểm trần. */
  async function seedPinned(count: number): Promise<void> {
    const base = Date.now() - count * 1000;
    await prisma.message.createMany({
      data: Array.from({ length: count }, (_, index) => ({
        id: randomUUID(),
        channelId,
        authorId: owner.id,
        content: `seeded pin ${index}`,
        pinnedAt: new Date(base + index * 1000),
        pinnedById: owner.id,
      })),
    });
  }

  function waitEvent<T>(socket: Socket, event: string, timeoutMs = 3000): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.off(event, handler);
        reject(new Error(`Timeout: no "${event}" event`));
      }, timeoutMs);
      const handler = (payload: T) => {
        clearTimeout(timer);
        resolve(payload);
      };
      socket.once(event, handler);
    });
  }

  async function connectClient(token: string): Promise<Socket> {
    const socket = io(`http://127.0.0.1:${port}`, {
      transports: ['websocket'],
      auth: { token },
      forceNew: true,
    });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('connect_error', (error) => reject(error));
    });
    const joined = (await socket.timeout(3000).emitWithAck('channel.join', { channelId })) as {
      ok: boolean;
    };
    expect(joined.ok).toBe(true);
    return socket;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    prisma = app.get(PrismaService);
    redis = app.get(RedisProvider);
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    const webOrigin = app.get(ConfigService).getOrThrow<string>('WEB_ORIGIN');
    app.useWebSocketAdapter(new RedisIoAdapter(app, redis, redis.duplicate(), webOrigin));
    await app.listen(0);
    const address = app.getHttpServer().address();
    port = typeof address === 'object' && address !== null ? address.port : 0;
    await redis.flushdb();

    owner = await registerUser();
    member = await registerUser();

    const server = await api('post', '/api/v1/servers', owner.token)
      .send({ name: 'Pins Test' })
      .expect(201);
    serverId = server.body.id;
    channelId = server.body.channels[0].id;
    await api('post', '/api/v1/servers/join', member.token)
      .send({ inviteCode: server.body.inviteCode })
      .expect(201);
  }, 30000);

  afterAll(async () => {
    for (const socket of sockets) socket.disconnect();
    try {
      if (serverId) await prisma.server.deleteMany({ where: { id: serverId } });
      await prisma.user.deleteMany({ where: { email: { in: emails } } });
    } finally {
      await app.close();
    }
  });

  beforeEach(async () => {
    await redis.flushdb();
    await prisma.message.updateMany({
      where: { channelId },
      data: { pinnedAt: null, pinnedById: null },
    });
  });

  it('ghim/bỏ ghim trả trạng thái chuẩn; thành viên thường bị 403 nhưng vẫn xem được danh sách', async () => {
    const messageId = await postMessage(owner.token, 'pin me');

    const pinned = await api('put', pinUrl(messageId), owner.token).expect(200);
    expect(pinned.body).toMatchObject({
      messageId,
      channelId,
      pinnedById: owner.id,
    });
    expect(typeof pinned.body.pinnedAt).toBe('string');

    // Thành viên thường: không có MANAGE_MESSAGES → 403, nhưng đọc danh sách vẫn được.
    await api('put', pinUrl(messageId), member.token).expect(403);
    const list = await api('get', pinsUrl(), member.token).expect(200);
    expect(list.body).toHaveLength(1);
    expect(list.body[0].message.id).toBe(messageId);
    expect(list.body[0].pinnedBy.id).toBe(owner.id);

    const unpinned = await api('delete', pinUrl(messageId), owner.token).expect(200);
    expect(unpinned.body.pinnedAt).toBeNull();
    expect(unpinned.body.pinnedById).toBeNull();
    expect((await api('get', pinsUrl(), owner.token).expect(200)).body).toHaveLength(0);
  });

  it('idempotent: ghim lại không ghi audit hay phát event lần hai', async () => {
    const messageId = await postMessage(owner.token, 'idempotent pin');
    const socket = await connectClient(owner.token);

    const first = waitEvent<{ messageId: string; channelId: string }>(socket, 'message.pinned');
    await api('put', pinUrl(messageId), owner.token).expect(200);
    await expect(first).resolves.toMatchObject({ messageId, channelId });

    let extra = 0;
    socket.on('message.pinned', () => {
      extra += 1;
    });
    await api('put', pinUrl(messageId), owner.token).expect(200);
    await new Promise((resolve) => setTimeout(resolve, 400));
    socket.off('message.pinned');
    expect(extra).toBe(0);

    const audits = await prisma.auditLog.findMany({
      where: { serverId, action: 'MESSAGE_PIN', targetId: messageId },
    });
    expect(audits).toHaveLength(1);
    expect(audits[0]?.actorId).toBe(owner.id);
    expect(audits[0]?.metadata).toMatchObject({ channelId });
  });

  it(`trần ${Limits.PINS_PER_CHANNEL}/channel: tin thứ 51 bị từ chối với mã lỗi riêng`, async () => {
    await seedPinned(Limits.PINS_PER_CHANNEL - 1);
    const last = await postMessage(owner.token, 'the 50th');
    await api('put', pinUrl(last), owner.token).expect(200);

    const overflow = await postMessage(owner.token, 'the 51st');
    const rejected = await api('put', pinUrl(overflow), owner.token).expect(400);
    expect(rejected.body.code).toBe('PIN_LIMIT_REACHED');
    expect(rejected.body.requestId).toBeTruthy();

    const list = await api('get', pinsUrl(), owner.token).expect(200);
    expect(list.body).toHaveLength(Limits.PINS_PER_CHANNEL);
  }, 30000);

  it('hai request ghim đồng thời không cùng vượt trần', async () => {
    await seedPinned(Limits.PINS_PER_CHANNEL - 1);
    const [a, b] = await Promise.all([
      postMessage(owner.token, 'race a'),
      postMessage(owner.token, 'race b'),
    ]);
    const results = await Promise.all([
      api('put', pinUrl(a), owner.token),
      api('put', pinUrl(b), owner.token),
    ]);
    expect(results.map((res) => res.status).sort()).toEqual([200, 400]);
  }, 30000);

  it('bỏ ghim idempotent, không phát event lần hai', async () => {
    const messageId = await postMessage(owner.token, 'unpin twice');
    await api('put', pinUrl(messageId), owner.token).expect(200);
    const socket = await connectClient(owner.token);

    const first = waitEvent<{ messageId: string }>(socket, 'message.unpinned');
    await api('delete', pinUrl(messageId), owner.token).expect(200);
    await expect(first).resolves.toMatchObject({ messageId });

    let extra = 0;
    socket.on('message.unpinned', () => {
      extra += 1;
    });
    await api('delete', pinUrl(messageId), owner.token).expect(200);
    await new Promise((resolve) => setTimeout(resolve, 400));
    socket.off('message.unpinned');
    expect(extra).toBe(0);
  });

  it('tin bị xóa mềm rời khỏi danh sách ghim và không còn ghim được', async () => {
    const messageId = await postMessage(owner.token, 'die then pin');
    await api('put', pinUrl(messageId), owner.token).expect(200);

    // Tác giả xóa tin của mình → ghim phải bị gỡ trong cùng transaction.
    await api('delete', `/api/v1/messages/${messageId}`, owner.token).expect(200);
    expect((await api('get', pinsUrl(), owner.token).expect(200)).body).toHaveLength(0);

    await api('put', pinUrl(messageId), owner.token).expect(404);
  });

  it('danh sách ghim sắp mới ghim trước', async () => {
    const first = await postMessage(owner.token, 'older pin');
    const second = await postMessage(owner.token, 'newer pin');
    await api('put', pinUrl(first), owner.token).expect(200);
    await api('put', pinUrl(second), owner.token).expect(200);

    const list = await api('get', pinsUrl(), owner.token).expect(200);
    expect(list.body.map((row: { message: { id: string } }) => row.message.id)).toEqual([
      second,
      first,
    ]);
  });

  it('xóa mềm không còn chiếm chỗ trong trần 50', async () => {
    await seedPinned(Limits.PINS_PER_CHANNEL - 1);
    const extra = await postMessage(owner.token, 'chỗ trống sau xóa');
    await api('put', pinUrl(extra), owner.token).expect(200);

    // Xóa mềm một tin đã ghim → còn 49, ghim thêm được.
    const somePin = await prisma.message.findFirstOrThrow({
      where: { channelId, pinnedAt: { not: null } },
      select: { id: true },
    });
    await api('delete', `/api/v1/messages/${somePin.id}`, owner.token).expect(200);
    const next = await postMessage(owner.token, 'sau khi giải phóng');
    await api('put', pinUrl(next), owner.token).expect(200);
  }, 30000);
});
