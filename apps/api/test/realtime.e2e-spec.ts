import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { RedisProvider } from '../src/infra/redis/redis.module.js';
import { RedisIoAdapter } from '../src/infra/socket/redis-io.adapter.js';

const runId = Date.now().toString(36);

interface TestUser {
  id: string;
  token: string;
}

/**
 * Bước 9 (guide 11.5): test tích hợp chạy HAI instance NestJS dùng chung một
 * Redis — chứng minh Redis adapter hoạt động thật: REST trên instance A phải
 * phát event tới client đang nối instance B, và typing/hiện diện đi hai chiều.
 *
 * Mỗi app là một DI container độc lập (Prisma, Redis, Gateway riêng) — đúng
 * như hai process riêng cùng chống một Redis trong production.
 */
describe('Realtime across two instances (e2e)', () => {
  let appA: INestApplication;
  let appB: INestApplication;
  let portA: number;
  let portB: number;

  const sockets: Socket[] = [];
  const emails: string[] = [];

  let owner: TestUser;
  let member: TestUser;
  let outsider: TestUser;
  /** Member nhưng CHƯA BAO GIỜ mở socket — dùng cho test presence (lần kết nối đầu tiên). */
  let bystander: TestUser;
  /** Member chỉ có @everyone — dùng cho test mất quyền xem và rời server. */
  let restricted: TestUser;
  let serverId: string;
  let channelId: string;
  let inviteCode: string;

  const uniqueSuffix = () => Math.random().toString(36).slice(2, 8);

  /** Chờ client nhận đúng một event, có timeout để test treo rõ ràng thay vì im lặng. */
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

  /** Đảm bảo event KHÔNG đến trong khoảng chờ — dùng cho case không có quyền. */
  async function assertNoEvent(socket: Socket, event: string, waitMs = 800): Promise<void> {
    const seen = await Promise.race([
      new Promise<boolean>((resolve) => socket.once(event, () => resolve(true))),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), waitMs)),
    ]);
    expect(seen).toBe(false);
  }

  function connectClient(port: number, token: string): Promise<Socket> {
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

  /** Gateway xử lý channel.join bất đồng bộ (query DB) — đợi nhẹ để room kịp gắn. */
  const settle = (ms = 250) => new Promise((resolve) => setTimeout(resolve, ms));

  async function bootInstance(): Promise<{ app: INestApplication; port: number }> {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    const app = moduleRef.createNestApplication();
    // main.ts không chạy trong e2e: tự lắp như thật — cookie-parser, prefix,
    // và RedisIoAdapter để Socket.IO share HTTP server + pub/sub qua Redis.
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    const redis = app.get(RedisProvider);
    const webOrigin = app.get(ConfigService).getOrThrow<string>('WEB_ORIGIN');
    app.useWebSocketAdapter(new RedisIoAdapter(app, redis, redis.duplicate(), webOrigin));
    await app.listen(0);
    const address = app.getHttpServer().address();
    const port = typeof address === 'object' && address !== null ? address.port : 0;
    return { app, port };
  }

  async function registerUser(instance: INestApplication): Promise<TestUser> {
    const email = `r-${runId}-${uniqueSuffix()}@ping.dev`;
    const username = `r${runId}${uniqueSuffix()}`.slice(0, 32);
    emails.push(email);

    const res = await request(instance.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, username, password: 'password123', displayName: 'RT' })
      .expect(201);

    return { id: res.body.user.id, token: res.body.accessToken };
  }

  beforeAll(async () => {
    const [a, b] = await Promise.all([bootInstance(), bootInstance()]);
    appA = a.app;
    appB = b.app;
    portA = a.port;
    portB = b.port;

    // Dọn presence/ability cache của các spec khác trước khi test bắt đầu.
    await appA.get(RedisProvider).flushdb();

    owner = await registerUser(appA);
    member = await registerUser(appA);
    outsider = await registerUser(appA);
    bystander = await registerUser(appA);
    restricted = await registerUser(appA);

    const serverRes = await request(appA.getHttpServer())
      .post('/api/v1/servers')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ name: 'Realtime Server' })
      .expect(201);
    serverId = serverRes.body.id;
    inviteCode = serverRes.body.inviteCode;

    const channelRes = await request(appA.getHttpServer())
      .post(`/api/v1/servers/${serverId}/channels`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ name: 'general' })
      .expect(201);
    channelId = channelRes.body.id;

    await request(appA.getHttpServer())
      .post('/api/v1/servers/join')
      .set('Authorization', `Bearer ${member.token}`)
      .send({ inviteCode })
      .expect(201);

    for (const user of [bystander, restricted]) {
      await request(appA.getHttpServer())
        .post('/api/v1/servers/join')
        .set('Authorization', `Bearer ${user.token}`)
        .send({ inviteCode })
        .expect(201);
    }
  }, 30000);

  /** Socket bị server ngắt trong khoảng chờ. */
  function waitDisconnect(socket: Socket, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Socket vẫn còn kết nối')), timeoutMs);
      socket.once('disconnect', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  }

  function postMessage(token: string, content: string) {
    return request(appA.getHttpServer())
      .post(`/api/v1/channels/${channelId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content, nonce: randomUUID() })
      .expect(201);
  }

  afterAll(async () => {
    for (const socket of sockets) {
      socket.disconnect();
    }
    // Cleanup: xóa server (cascade channel/role/member/message).
    if (appA && serverId) {
      await appA
        .get(PrismaService)
        .server.delete({ where: { id: serverId } })
        .catch(() => undefined);
    }
    await appA?.close();
    await appB?.close();
  });

  it('từ chối kết nối socket không có access token', async () => {
    // Không có middleware chặn handshake nên client luôn "connect" được rồi mới
    // bị gateway ngắt khi xác thực — kỳ vọng là disconnect ngay sau đó.
    const socket = io(`http://127.0.0.1:${portB}`, {
      transports: ['websocket'],
      reconnection: false,
    });
    sockets.push(socket);

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('Socket không token vẫn giữ kết nối quá 3s')),
        3000,
      );
      socket.once('connect', () => {
        socket.once('disconnect', () => {
          clearTimeout(timer);
          resolve();
        });
      });
      socket.once('connect_error', () => {
        clearTimeout(timer);
        resolve();
      });
    });
  });

  it('REST trên instance A phát message.created tới client nối instance B', async () => {
    const clientB = await connectClient(portB, owner.token);
    clientB.emit('channel.join', { channelId });
    await settle();

    const received = waitEvent<{
      id: string;
      channelId: string;
      authorId: string;
      content: string;
      createdAt: string;
      nonce: string | null;
      author: { id: string; username: string };
    }>(clientB, 'message.created');

    // Tạo tin nhắn qua REST của instance A — client đang ở instance B.
    const nonce = randomUUID();
    const res = await request(appA.getHttpServer())
      .post(`/api/v1/channels/${channelId}/messages`)
      .set('Authorization', `Bearer ${member.token}`)
      .send({ content: 'hello from A', nonce })
      .expect(201);

    const payload = await received;
    expect(payload.id).toBe(res.body.id);
    expect(payload.content).toBe('hello from A');
    expect(payload.authorId).toBe(member.id);
    expect(payload.channelId).toBe(channelId);
    // Client gửi khớp tin optimistic theo nonce; client khác hiện tác giả không cần gọi thêm API.
    expect(payload.nonce).toBe(nonce);
    expect(payload.author).toMatchObject({ id: member.id, username: res.body.author.username });
    clientB.disconnect();
  });

  it('typing phát từ client instance B được relay tới client instance A', async () => {
    const [clientA, clientB] = await Promise.all([
      connectClient(portA, member.token),
      connectClient(portB, member.token),
    ]);
    clientA.emit('channel.join', { channelId });
    clientB.emit('channel.join', { channelId });
    await settle();

    const received = waitEvent<{ channelId: string; userId: string }>(clientA, 'typing.started');
    clientB.emit('typing', { channelId });

    const payload = await received;
    expect(payload.channelId).toBe(channelId);
    expect(payload.userId).toBe(member.id);

    // Gõ dồn dập: event thứ hai ngay sau đó bị nuốt (giới hạn tần suất theo socket).
    clientB.emit('typing', { channelId });
    await assertNoEvent(clientA, 'typing.started', 500);
    clientA.disconnect();
    clientB.disconnect();
  });

  it('typing từ người ngoài channel (biết channelId) không được relay', async () => {
    const watcher = await connectClient(portA, owner.token);
    watcher.emit('channel.join', { channelId });
    const outsiderSocket = await connectClient(portB, outsider.token);
    await settle();

    outsiderSocket.emit('typing', { channelId });
    await assertNoEvent(watcher, 'typing.started');
    watcher.disconnect();
    outsiderSocket.disconnect();
  });

  it('payload sai định dạng bị bỏ qua, không làm sập gateway', async () => {
    const socket = await connectClient(portA, member.token);
    socket.emit('channel.join', { channelId: 'khong-phai-uuid' });
    socket.emit('typing', null);
    await settle();
    expect(socket.connected).toBe(true);
    socket.disconnect();
  });

  it('socket bị ngắt khi access token hết hạn', async () => {
    const shortToken = await appA
      .get(JwtService)
      .signAsync({ sub: member.id, username: 'short' }, { expiresIn: '2s' });
    const socket = await connectClient(portA, shortToken);
    await waitDisconnect(socket, 5000);
  }, 10000);

  it('client không phải member không join được room và không nhận event', async () => {
    const outsiderSocket = await connectClient(portA, outsider.token);
    outsiderSocket.emit('channel.join', { channelId });
    await settle();

    const watcher = await connectClient(portB, owner.token);
    watcher.emit('channel.join', { channelId });
    await settle();

    // Người ngoài room vẫn gửi được REST, nhưng event không tới tay outsider.
    await request(appA.getHttpServer())
      .post(`/api/v1/channels/${channelId}/messages`)
      .set('Authorization', `Bearer ${member.token}`)
      .send({ content: 'members only', nonce: randomUUID() })
      .expect(201);

    await assertNoEvent(outsiderSocket, 'message.created');
    outsiderSocket.disconnect();
    watcher.disconnect();
  });

  it('presence online phát sang instance khác khi user mới kết nối', async () => {
    // Owner đang ở instance B (đã join server room qua channel.join).
    const watcherB = await connectClient(portB, owner.token);
    watcherB.emit('channel.join', { channelId });
    await settle();

    // Bystander là member nhưng chưa từng mở socket → counter 0 → 1 → broadcast.
    // (Dùng user chưa kết nối bao giờ để không phụ thuộc thứ tự test trước.)
    const received = waitEvent<{ userId: string; status: string }>(
      watcherB,
      'presence.updated',
      5000,
    );
    const bystanderSocket = await connectClient(portA, bystander.token);

    const payload = await received;
    expect(payload.userId).toBe(bystander.id);
    expect(payload.status).toBe('online');

    // Tab thứ hai ở instance khác: đóng một tab không được báo offline.
    const secondTab = await connectClient(portB, bystander.token);
    await settle();
    bystanderSocket.disconnect();
    await assertNoEvent(watcherB, 'presence.updated');

    const lastTabClosed = waitEvent<{ userId: string; status: string }>(
      watcherB,
      'presence.updated',
    );
    secondTab.disconnect();
    expect(await lastTabClosed).toEqual({ userId: bystander.id, status: 'offline' });
    watcherB.disconnect();
  });

  it('member không có VIEW_CHANNEL không vào được room channel', async () => {
    const roles = await request(appA.getHttpServer())
      .get(`/api/v1/servers/${serverId}/roles`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    const everyone = roles.body.find((role: { isDefault: boolean }) => role.isDefault);
    const setEveryone = (permissions: string) =>
      request(appA.getHttpServer())
        .patch(`/api/v1/roles/${everyone.id}`)
        .set('Authorization', `Bearer ${owner.token}`)
        .send({ permissions })
        .expect(200);

    await setEveryone('0');
    try {
      const socket = await connectClient(portB, restricted.token);
      socket.emit('channel.join', { channelId });
      await settle();
      await postMessage(owner.token, 'hidden');
      await assertNoEvent(socket, 'message.created');
      socket.disconnect();
    } finally {
      await setEveryone(everyone.permissions);
    }
  });

  it('rời server thì socket đang mở thôi nhận tin của channel ngay', async () => {
    const socket = await connectClient(portB, restricted.token);
    socket.emit('channel.join', { channelId });
    await settle();
    const first = waitEvent(socket, 'message.created');
    await postMessage(member.token, 'before leave');
    await first;

    await request(appA.getHttpServer())
      .post(`/api/v1/servers/${serverId}/leave`)
      .set('Authorization', `Bearer ${restricted.token}`)
      .expect(204);
    await settle();

    await postMessage(member.token, 'after leave');
    await assertNoEvent(socket, 'message.created');
    socket.disconnect();
  });

  it('permissions.changed: sửa role → member nhận event riêng để tải lại quyền', async () => {
    const socket = await connectClient(portB, member.token);
    await settle();
    const roles = await request(appA.getHttpServer())
      .get(`/api/v1/servers/${serverId}/roles`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    const everyone = roles.body.find((role: { isDefault: boolean }) => role.isDefault);

    const received = waitEvent<{ serverId: string }>(socket, 'permissions.changed');
    await request(appA.getHttpServer())
      .patch(`/api/v1/roles/${everyone.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ name: '@everyone' })
      .expect(200);

    expect(await received).toEqual({ serverId });
    socket.disconnect();
  });

  it('member.removed: bị kick → nhận event riêng để rời server ở client', async () => {
    const socket = await connectClient(portB, bystander.token);
    await settle();
    const members = await request(appA.getHttpServer())
      .get(`/api/v1/servers/${serverId}/members`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);
    const target = members.body.find((m: { userId: string }) => m.userId === bystander.id);

    const received = waitEvent<{ serverId: string }>(socket, 'member.removed');
    await request(appA.getHttpServer())
      .delete(`/api/v1/servers/${serverId}/members/${target.id}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(204);

    expect(await received).toEqual({ serverId });
    socket.disconnect();
  });

  // LUÔN để cuối: xóa server mà các test trên dùng chung.
  it('member.removed: server bị xóa → mọi member nhận event riêng', async () => {
    const socket = await connectClient(portA, member.token);
    await settle();
    const received = waitEvent<{ serverId: string }>(socket, 'member.removed');

    await request(appA.getHttpServer())
      .delete(`/api/v1/servers/${serverId}`)
      .set('Authorization', `Bearer ${owner.token}`)
      .expect(200);

    expect(await received).toEqual({ serverId });
    socket.disconnect();
    // Cho request chéo instance của handleDisconnect chạy xong trước khi afterAll tắt app:
    // Nest đóng Redis (onModuleDestroy) trước Socket.IO, publish dở dang sẽ thành unhandled rejection.
    await settle();
  });
});
