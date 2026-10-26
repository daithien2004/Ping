import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { Permissions, isAllowedReactionEmoji } from '@ping/shared';
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
 * TG.2 (ADR-0064): cảm xúc trên tin — idempotent, tổng hợp count/me, giới hạn 20 loại,
 * allowlist emoji, quyền ADD_REACTIONS, danh sách người thả phân trang và event realtime.
 */
describe('Message reactions (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisProvider;
  let port = 0;
  const emails: string[] = [];
  const sockets: Socket[] = [];

  let author: TestUser;
  let reactor: TestUser;
  let reactor2: TestUser;
  let restricted: TestUser;
  let serverId = '';
  let channelId = '';
  let inviteCode = '';

  const uniqueSuffix = () => Math.random().toString(36).slice(2, 8);

  async function registerUser(): Promise<TestUser> {
    const email = `r-${runId}-${uniqueSuffix()}@ping.dev`;
    const username = `r${runId}${uniqueSuffix()}`.slice(0, 32);
    emails.push(email);
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, username, password: 'password123', displayName: 'RX' })
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

  const reactionUrl = (messageId: string, emoji: string) =>
    `/api/v1/messages/${messageId}/reactions/${encodeURIComponent(emoji)}`;

  async function postMessage(token: string, content = 'hello'): Promise<string> {
    const res = await api('post', `/api/v1/channels/${channelId}/messages`, token)
      .send({ content, nonce: randomUUID() })
      .expect(201);
    return res.body.id;
  }

  async function messagesOf(messageId: string, token: string) {
    const res = await api('get', `/api/v1/channels/${channelId}/messages`, token).expect(200);
    return res.body.messages.find((message: { id: string }) => message.id === messageId);
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

    author = await registerUser();
    reactor = await registerUser();
    reactor2 = await registerUser();
    restricted = await registerUser();

    const server = await api('post', '/api/v1/servers', author.token)
      .send({ name: 'Reactions Test' })
      .expect(201);
    serverId = server.body.id;
    channelId = server.body.channels[0].id;
    inviteCode = server.body.inviteCode;
    for (const user of [reactor, reactor2, restricted]) {
      await api('post', '/api/v1/servers/join', user.token).send({ inviteCode }).expect(201);
    }
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
    // E2E uses Redis DB 1; isolate rate limits and authorization caches between cases.
    await redis.flushdb();
  });

  it('enforces the 20-type limit when two new emoji arrive concurrently', async () => {
    const messageId = await postMessage(author.token, 'concurrent limit');
    const emoji = [
      '😀',
      '😃',
      '😄',
      '😁',
      '😆',
      '😅',
      '🤣',
      '😂',
      '🙂',
      '🙃',
      '😉',
      '😊',
      '😇',
      '🥰',
      '😍',
      '😎',
      '🥳',
      '🤔',
      '🤗',
    ];
    await prisma.messageReaction.createMany({
      data: emoji.map((value) => ({ messageId, userId: author.id, emoji: value })),
    });
    const responses = await Promise.all([
      api('put', reactionUrl(messageId, '🔥'), reactor.token),
      api('put', reactionUrl(messageId, '🎉'), reactor2.token),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 400]);
    expect(responses.find((response) => response.status === 400)?.body.code).toBe(
      'REACTION_LIMIT_REACHED',
    );
    expect((await messagesOf(messageId, author.token)).reactions).toHaveLength(20);
  });

  it('returns reaction ownership for the editor rather than the message author', async () => {
    const messageId = await postMessage(reactor.token, 'editable by owner');
    await api('put', reactionUrl(messageId, '👍'), reactor.token).expect(200);
    const edited = await api('patch', `/api/v1/messages/${messageId}`, author.token)
      .send({ content: 'owner edit' })
      .expect(200);
    expect(edited.body.reactions).toEqual([{ emoji: '👍', count: 1, me: false }]);
  });

  it('deduplicates concurrent retries while preserving both users reactions', async () => {
    const messageId = await postMessage(author.token, 'concurrent retries');
    const users = [reactor, reactor2];
    const url = reactionUrl(messageId, '👍');
    const added = await Promise.all(
      Array.from({ length: 8 }, (_, index) => api('put', url, users[index % users.length]!.token)),
    );
    expect(added.every((response) => response.status === 200)).toBe(true);
    expect((await messagesOf(messageId, reactor.token)).reactions).toEqual([
      { emoji: '👍', count: 2, me: true },
    ]);
    const removed = await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        api('delete', url, users[index % users.length]!.token),
      ),
    );
    expect(removed.every((response) => response.status === 200)).toBe(true);
    expect((await messagesOf(messageId, reactor.token)).reactions).toEqual([]);
  });

  it('rate limits reaction writes per user and channel', async () => {
    const messageId = await postMessage(author.token, 'reaction rate');
    for (let index = 0; index < 30; index += 1) {
      await api('put', reactionUrl(messageId, '👍'), reactor.token).expect(200);
    }
    const blocked = await api('put', reactionUrl(messageId, '👍'), reactor.token).expect(429);
    expect(blocked.body.code).toBe('TOO_MANY_REQUESTS');
    expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(0);
    await api('put', reactionUrl(messageId, '👍'), reactor2.token).expect(200);
  });

  it('adds and removes idempotently, and the list aggregates count + me', async () => {
    const messageId = await postMessage(author.token, 'react to me');

    const added = await api('put', reactionUrl(messageId, '👍'), reactor.token).expect(200);
    expect(added.body).toMatchObject({
      messageId,
      reactions: [{ emoji: '👍', count: 1, me: true }],
    });

    // Thả lại cùng emoji: không tạo hàng thứ hai.
    const again = await api('put', reactionUrl(messageId, '👍'), reactor.token).expect(200);
    expect(again.body.reactions).toEqual([{ emoji: '👍', count: 1, me: true }]);

    // Người khác thấy count 2 nhưng me = false.
    const seenByOther = await messagesOf(messageId, author.token);
    expect(seenByOther.reactions).toEqual([{ emoji: '👍', count: 1, me: false }]);
    await api('put', reactionUrl(messageId, '👍'), reactor2.token).expect(200);
    expect((await messagesOf(messageId, author.token)).reactions).toEqual([
      { emoji: '👍', count: 2, me: false },
    ]);
    expect((await messagesOf(messageId, reactor.token)).reactions).toEqual([
      { emoji: '👍', count: 2, me: true },
    ]);

    // Gỡ idempotent: lần hai vẫn 200 và không đổi trạng thái.
    await api('delete', reactionUrl(messageId, '👍'), reactor.token).expect(200);
    const removedAgain = await api('delete', reactionUrl(messageId, '👍'), reactor.token).expect(
      200,
    );
    expect(removedAgain.body.reactions).toEqual([{ emoji: '👍', count: 1, me: false }]);
  });

  it('sorts reactions by count and keeps each emoji separate', async () => {
    const messageId = await postMessage(author.token, 'many emoji');
    await api('put', reactionUrl(messageId, '👍'), reactor.token).expect(200);
    await api('put', reactionUrl(messageId, '👍'), reactor2.token).expect(200);
    await api('put', reactionUrl(messageId, '🎉'), reactor.token).expect(200);

    expect((await messagesOf(messageId, reactor.token)).reactions).toEqual([
      { emoji: '👍', count: 2, me: true },
      { emoji: '🎉', count: 1, me: true },
    ]);
  });

  it('rejects a 21st distinct emoji with a specific code, and invalid emoji input', async () => {
    const messageId = await postMessage(author.token, 'limit');
    const twenty = [
      '😀',
      '😃',
      '😄',
      '😁',
      '😆',
      '😅',
      '🤣',
      '😂',
      '🙂',
      '🙃',
      '😉',
      '😊',
      '😇',
      '🥰',
      '😍',
      '😎',
      '🥳',
      '🤔',
      '🤗',
      '🤭',
    ];
    expect(twenty.every(isAllowedReactionEmoji)).toBe(true);
    for (const emoji of twenty) {
      await api('put', reactionUrl(messageId, emoji), reactor2.token).expect(200);
    }
    const overflow = await api('put', reactionUrl(messageId, '🔥'), reactor2.token).expect(400);
    expect(overflow.body.code).toBe('REACTION_LIMIT_REACHED');

    // Thả lại một emoji đã có vẫn được (không phải loại mới).
    await api('put', reactionUrl(messageId, '😀'), reactor2.token).expect(200);

    const invalid = await api('put', reactionUrl(messageId, 'hello'), reactor.token).expect(400);
    expect(invalid.body.code).toBe('REACTION_EMOJI_INVALID');
  });

  it('lists reactors with keyset pagination and a total', async () => {
    const messageId = await postMessage(author.token, 'who reacted');
    for (const user of [author, reactor, reactor2]) {
      await api('put', reactionUrl(messageId, '❤️'), user.token).expect(200);
    }
    const first = await api(
      'get',
      `/api/v1/messages/${messageId}/reactions/${encodeURIComponent('❤️')}?limit=2`,
      reactor.token,
    ).expect(200);
    expect(first.body.total).toBe(3);
    expect(first.body.hasMore).toBe(true);
    expect(first.body.users).toHaveLength(2);
    expect(first.body.nextCursor).toEqual(expect.any(String));

    const second = await api(
      'get',
      `/api/v1/messages/${messageId}/reactions/${encodeURIComponent('❤️')}?limit=2&after=${first.body.nextCursor}`,
      reactor.token,
    ).expect(200);
    expect(second.body.hasMore).toBe(false);
    expect(second.body.users).toHaveLength(1);
    expect(second.body.nextCursor).toBeNull();
    expect(second.body.total).toBe(3);
  });

  it('requires ADD_REACTIONS and rejects reactions on deleted messages', async () => {
    const messageId = await postMessage(author.token, 'permission');
    const everyone = await prisma.role.findFirstOrThrow({
      where: { serverId, isDefault: true },
      select: { id: true },
    });
    try {
      await prisma.role.update({
        where: { id: everyone.id },
        data: { permissions: Permissions.VIEW_CHANNEL | Permissions.SEND_MESSAGES },
      });
      await redis.flushdb();
      const denied = await api('put', reactionUrl(messageId, '👍'), restricted.token).expect(403);
      expect(denied.body.code).toBe('FORBIDDEN');
    } finally {
      await prisma.role.update({
        where: { id: everyone.id },
        data: {
          permissions:
            Permissions.VIEW_CHANNEL | Permissions.SEND_MESSAGES | Permissions.ADD_REACTIONS,
        },
      });
      await redis.flushdb();
    }

    await api('delete', `/api/v1/messages/${messageId}`, author.token).expect(200);
    const missing = await api('put', reactionUrl(messageId, '👍'), reactor.token).expect(404);
    expect(missing.body.code).toBe('NOT_FOUND');
  });

  it('emits reaction.added/removed with the authoritative count', async () => {
    const messageId = await postMessage(author.token, 'realtime');
    const socket = await connectClient(reactor.token);

    const added = waitEvent<{ messageId: string; emoji: string; count: number }>(
      socket,
      'reaction.added',
    );
    await api('put', reactionUrl(messageId, '🔥'), reactor.token).expect(200);
    await expect(added).resolves.toMatchObject({
      messageId,
      emoji: '🔥',
      userId: reactor.id,
      count: 1,
    });

    // Idempotent PUT không phát event lần hai: chờ 500 ms, không nhận gì.
    let extra = 0;
    const countExtra = () => {
      extra += 1;
    };
    socket.on('reaction.added', countExtra);
    await api('put', reactionUrl(messageId, '🔥'), reactor.token).expect(200);
    await new Promise((resolve) => setTimeout(resolve, 500));
    socket.off('reaction.added', countExtra);
    expect(extra).toBe(0);

    const removed = waitEvent<{ count: number }>(socket, 'reaction.removed');
    await api('delete', reactionUrl(messageId, '🔥'), reactor.token).expect(200);
    await expect(removed).resolves.toMatchObject({ messageId, emoji: '🔥', count: 0 });
  });
});
