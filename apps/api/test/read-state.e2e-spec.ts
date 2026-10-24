import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
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
 * T4.2: PUT /channels/:id/read (chỉ tiến), GET /servers/:id/unread (đếm có trần, không tính
 * tin đã xóa mềm/tin của chính mình, mention theo user/role/everyone), `read.updated` đồng bộ
 * hai tab và `mention.created` chỉ tới người được nhắc.
 */
describe('Read state & unread (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const emails: string[] = [];
  const sockets: Socket[] = [];

  let owner: TestUser;
  let reader: TestUser;
  let other: TestUser;
  let outsider: TestUser;
  let serverId: string;
  let ch1: string; // diễn ra mọi tin của test
  let ch2: string; // chỉ dùng cho trần 100
  let readerUsername = '';

  const uniqueSuffix = () => Math.random().toString(36).slice(2, 8);
  const nonce = () => randomUUID();

  async function registerUser(): Promise<TestUser> {
    const email = `rs-${runId}-${uniqueSuffix()}@ping.dev`;
    const username = `rs${runId}${uniqueSuffix()}`.slice(0, 32);
    emails.push(email);
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, username, password: 'password123', displayName: 'RS' })
      .expect(201);
    return { id: res.body.user.id, token: res.body.accessToken };
  }

  function api(method: 'get' | 'post' | 'put' | 'delete', url: string, token?: string) {
    const agent = request(app.getHttpServer());
    const call = {
      get: () => agent.get(url),
      post: () => agent.post(url),
      put: () => agent.put(url),
      delete: () => agent.delete(url),
    }[method]();
    return token ? call.set('Authorization', `Bearer ${token}`) : call;
  }

  async function send(token: string, channelId: string, content: string): Promise<string> {
    const res = await api('post', `/api/v1/channels/${channelId}/messages`, token)
      .send({ content, nonce: nonce() })
      .expect(201);
    return res.body.id as string;
  }

  async function unreadOf(token: string, channelId: string) {
    const res = await api('get', `/api/v1/servers/${serverId}/unread`, token).expect(200);
    const row = (
      res.body as Array<{ channelId: string; unreadCount: number; mentionCount: number }>
    ).find((item) => item.channelId === channelId);
    expect(row).toBeDefined();
    return row!;
  }

  function waitEvent<T>(socket: Socket, event: string, timeoutMs = 5000): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.off(event, handler);
        reject(new Error(`Timeout: không nhận được "${event}"`));
      }, timeoutMs);
      const handler = (payload: T) => {
        clearTimeout(timer);
        resolve(payload);
      };
      socket.once(event, handler);
    });
  }

  async function assertNoEvent(socket: Socket, event: string, waitMs = 1000): Promise<void> {
    const seen = await Promise.race([
      new Promise<boolean>((resolve) => socket.once(event, () => resolve(true))),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), waitMs)),
    ]);
    expect(seen).toBe(false);
  }

  function connectClient(token: string): Promise<Socket> {
    const port = app.getHttpServer().address().port;
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

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    const redis = app.get(RedisProvider);
    const webOrigin = app.get(ConfigService).getOrThrow<string>('WEB_ORIGIN');
    app.useWebSocketAdapter(new RedisIoAdapter(app, redis, redis.duplicate(), webOrigin));
    await app.init();
    await app.listen(0);
    prisma = app.get(PrismaService);
    await app.get(RedisProvider).flushdb();

    owner = await registerUser();
    reader = await registerUser();
    other = await registerUser();
    outsider = await registerUser();

    const server = await api('post', '/api/v1/servers', owner.token)
      .send({ name: 'Read State Test' })
      .expect(201);
    serverId = server.body.id;
    ch1 = server.body.channels[0].id;
    const second = await api('post', `/api/v1/servers/${serverId}/channels`, owner.token)
      .send({ name: 'random' })
      .expect(201);
    ch2 = second.body.id;

    // reader mang role `mods` để test mention theo role.
    const role = await api('post', `/api/v1/servers/${serverId}/roles`, owner.token)
      .send({ name: 'mods', permissions: '3' }) // VIEW_CHANNEL | SEND_MESSAGES
      .expect(201);
    const members = await api('get', `/api/v1/servers/${serverId}/members`, owner.token).expect(
      200,
    );
    const memberRows = members.body.members as Array<{ id: string; userId: string }>;
    for (const user of [reader, other]) {
      await api('post', '/api/v1/servers/join', user.token)
        .send({ inviteCode: server.body.inviteCode })
        .expect(201);
    }
    const readerMember = memberRows.find((row) => row.userId === reader.id);
    // memberRows lấy TRƯỚC khi join — lấy lại id member của reader.
    const afterJoin = await api('get', `/api/v1/servers/${serverId}/members`, owner.token).expect(
      200,
    );
    const readerRow = (afterJoin.body.members as Array<{ id: string; userId: string }>).find(
      (row) => row.userId === reader.id,
    );
    expect(readerRow).toBeDefined();
    await api('put', `/api/v1/servers/${serverId}/members/${readerRow!.id}/roles`, owner.token)
      .send({ roleIds: [role.body.id] })
      .expect(200);
    expect(readerMember).toBeUndefined(); // sanity: trước join không có

    const user = await prisma.user.findUniqueOrThrow({
      where: { id: reader.id },
      select: { username: true },
    });
    readerUsername = user.username;
  });

  afterAll(async () => {
    for (const socket of sockets) socket.disconnect();
    const users = await prisma.user.findMany({
      where: { email: { in: emails } },
      select: { id: true },
    });
    const ids = users.map((row) => row.id);
    await prisma.message.deleteMany({ where: { authorId: { in: ids } } });
    await prisma.server.deleteMany({ where: { ownerId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  it('unread ban đầu: đếm tin của người khác, không đếm tin của chính mình; kênh khác 0', async () => {
    for (let i = 0; i < 5; i += 1) {
      await send(owner.token, ch1, `tin ${i}`);
    }
    await send(reader.token, ch1, 'tin của chính mình');

    const ch1Row = await unreadOf(reader.token, ch1);
    expect(ch1Row).toMatchObject({ unreadCount: 5, mentionCount: 0 });
    const ch2Row = await unreadOf(reader.token, ch2);
    expect(ch2Row).toMatchObject({ unreadCount: 0, mentionCount: 0 });
  });

  it('mention theo user, role và everyone đều vào mentionCount', async () => {
    await send(owner.token, ch1, `@${readerUsername} chào`);
    await send(owner.token, ch1, '@mods họp');
    await send(owner.token, ch1, '@everyone thông báo');

    const row = await unreadOf(reader.token, ch1);
    // 5 tin đầu + 3 tin mention, không tính tin của reader.
    expect(row).toMatchObject({ unreadCount: 8, mentionCount: 3 });
    // Với `other`: 9 tin chưa đọc (tin của reader cũng là unread với người khác), chỉ bị
    // @everyone nhắc (không mang role mods, không được nhắc trực tiếp).
    const otherRow = await unreadOf(other.token, ch1);
    expect(otherRow).toMatchObject({ unreadCount: 9, mentionCount: 1 });
  });

  it('PUT read chỉ tiến: cursor mới hơn giảm unread, cursor cũ hơn không làm lùi, sai channel 404', async () => {
    const messages = await prisma.message.findMany({
      where: { channelId: ch1, deletedAt: null },
      orderBy: { id: 'asc' },
      select: { id: true, authorId: true },
    });
    // Mốc = tin thứ 5 của owner (5 tin đầu) → còn 3 tin mention chưa đọc.
    const fifth = messages.filter((row) => row.authorId === owner.id)[4]!;

    await api('put', `/api/v1/channels/${ch1}/read`, reader.token)
      .send({ messageId: fifth.id })
      .expect(204);
    expect(await unreadOf(reader.token, ch1)).toMatchObject({ unreadCount: 3, mentionCount: 3 });

    // Cursor cũ hơn (tin thứ 3) không được làm lùi mốc.
    const third = messages.filter((row) => row.authorId === owner.id)[2]!;
    await api('put', `/api/v1/channels/${ch1}/read`, reader.token)
      .send({ messageId: third.id })
      .expect(204);
    expect(await unreadOf(reader.token, ch1)).toMatchObject({ unreadCount: 3, mentionCount: 3 });

    // MessageId không thuộc channel này → 404, không đổi mốc.
    await api('put', `/api/v1/channels/${ch1}/read`, reader.token)
      .send({ messageId: randomUUID() })
      .expect(404);
    expect(await unreadOf(reader.token, ch1)).toMatchObject({ unreadCount: 3, mentionCount: 3 });
  });

  it('tin đã xóa mềm không còn đếm', async () => {
    const mentions = await prisma.message.findMany({
      where: { channelId: ch1, deletedAt: null, authorId: owner.id },
      orderBy: { id: 'desc' },
      select: { id: true },
    });
    const newest = mentions[0]!;
    await api('delete', `/api/v1/messages/${newest.id}`, owner.token).expect(200);
    expect(await unreadOf(reader.token, ch1)).toMatchObject({ unreadCount: 2, mentionCount: 2 });
  });

  it('trần đếm: 105 tin mới → unreadCount dừng ở 100', async () => {
    await prisma.message.createMany({
      data: Array.from({ length: 105 }, (_, i) => ({
        channelId: ch2,
        authorId: owner.id,
        content: `bulk ${i}`,
      })),
    });
    expect(await unreadOf(reader.token, ch2)).toMatchObject({ unreadCount: 100 });
  });

  it('read.updated đồng bộ hai tab của cùng user', async () => {
    const tabA = await connectClient(reader.token);
    const tabB = await connectClient(reader.token);

    const messages = await prisma.message.findMany({
      where: { channelId: ch1, deletedAt: null },
      orderBy: { id: 'desc' },
      select: { id: true },
    });
    const newest = messages[0]!;
    // Gắn listener TRƯỚC khi PUT — event phát trong lúc xử lý request.
    const waitA = waitEvent<{
      channelId: string;
      lastReadMessageId: string;
    }>(tabA, 'read.updated');
    const waitB = waitEvent<{
      channelId: string;
      lastReadMessageId: string;
    }>(tabB, 'read.updated');

    await api('put', `/api/v1/channels/${ch1}/read`, reader.token)
      .send({ messageId: newest.id })
      .expect(204);

    await expect(waitA).resolves.toEqual({
      channelId: ch1,
      lastReadMessageId: newest.id,
    });
    await expect(waitB).resolves.toEqual({
      channelId: ch1,
      lastReadMessageId: newest.id,
    });
    expect(await unreadOf(reader.token, ch1)).toMatchObject({ unreadCount: 0, mentionCount: 0 });
  });

  it('mention.created chỉ tới người được nhắc', async () => {
    const readerSocket = await connectClient(reader.token);
    const otherSocket = await connectClient(other.token);

    const messageId = await send(owner.token, ch1, `@${readerUsername} ping riêng`);
    await expect(waitEvent(readerSocket, 'mention.created')).resolves.toEqual({
      messageId,
      channelId: ch1,
      serverId,
    });
    await assertNoEvent(otherSocket, 'mention.created');
  });

  it('người ngoài không được đọc unread hay đánh dấu đã đọc (IDOR)', async () => {
    await api('get', `/api/v1/servers/${serverId}/unread`, outsider.token).expect(403);
    await api('put', `/api/v1/channels/${ch1}/read`, outsider.token)
      .send({ messageId: randomUUID() })
      .expect(403);
  });
});
