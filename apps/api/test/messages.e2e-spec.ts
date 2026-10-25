import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Permissions } from '@ping/shared';
import cookieParser from 'cookie-parser';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { RedisProvider } from '../src/infra/redis/redis.module.js';

const runId = Date.now().toString(36);

interface TestUser {
  id: string;
  email: string;
  token: string;
}

type HttpMethod = 'get' | 'post' | 'patch' | 'put' | 'delete';

/**
 * Bộ test API tin nhắn (guide 10.3/10.5): tác giả - moderator - người lạ,
 * phân trang cursor, soft delete và idempotency theo nonce.
 */
describe('Messages (e2e)', () => {
  let app: INestApplication;
  const emails: string[] = [];

  let author: TestUser;
  let other: TestUser;
  let moderator: TestUser;
  let outsider: TestUser;
  let serverId: string;
  let channelId: string;
  let inviteCode = '';

  /** Tin của author theo thứ tự cũ → mới; uuid(7) tăng theo thời gian nên id cũng vậy. */
  const messageIds: string[] = [];
  const nonces: string[] = [];
  let otherMessageId = '';

  const uniqueSuffix = () => Math.random().toString(36).slice(2, 8);

  async function registerUser(): Promise<TestUser> {
    const email = `m-${runId}-${uniqueSuffix()}@ping.dev`;
    const username = `m${runId}${uniqueSuffix()}`.slice(0, 32);
    emails.push(email);

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, username, password: 'password123', displayName: 'E2E' })
      .expect(201);

    return { id: res.body.user.id, email, token: res.body.accessToken };
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

  async function memberIdOf(user: TestUser): Promise<string> {
    const res = await api('get', `/api/v1/servers/${serverId}/members`, author.token).expect(200);
    const member = res.body.members.find((item: { userId: string }) => item.userId === user.id);
    if (!member) {
      throw new Error('Member not found');
    }
    return member.id;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    await app.init();

    const redis = moduleRef.get(RedisProvider);
    await redis.flushdb();

    author = await registerUser();
    other = await registerUser();
    moderator = await registerUser();
    outsider = await registerUser();

    // author làm owner: tạo server (đã tự có #general) rồi mời other + moderator.
    const server = await api('post', '/api/v1/servers', author.token)
      .send({ name: 'Messages Test' })
      .expect(201);
    serverId = server.body.id;
    channelId = server.body.channels[0].id;
    inviteCode = server.body.inviteCode;

    await api('post', '/api/v1/servers/join', other.token).send({ inviteCode }).expect(201);
    await api('post', '/api/v1/servers/join', moderator.token).send({ inviteCode }).expect(201);

    // Moderator chỉ hơn member thường đúng bit MANAGE_MESSAGES.
    const role = await api('post', `/api/v1/servers/${serverId}/roles`, author.token)
      .send({
        name: 'mod',
        permissions: (
          Permissions.VIEW_CHANNEL |
          Permissions.SEND_MESSAGES |
          Permissions.MANAGE_MESSAGES
        ).toString(),
      })
      .expect(201);
    const moderatorMemberId = await memberIdOf(moderator);
    await api('put', `/api/v1/servers/${serverId}/members/${moderatorMemberId}/roles`, author.token)
      .send({ roleIds: [role.body.id] })
      .expect(200);
  });

  afterAll(async () => {
    const prisma = app.get(PrismaService);
    const users = await prisma.user.findMany({
      where: { email: { in: emails } },
      select: { id: true },
    });
    const userIds = users.map((user) => user.id);
    await prisma.message.deleteMany({ where: { authorId: { in: userIds } } });
    await prisma.server.deleteMany({ where: { ownerId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it('POST /channels/:id/messages — gửi 5 tin; retry cùng nonce trả đúng tin cũ, không ghi trùng', async () => {
    for (let index = 0; index < 5; index += 1) {
      const nonce = randomUUID();
      nonces.push(nonce);

      const res = await api('post', `/api/v1/channels/${channelId}/messages`, author.token)
        .send({ content: `tin so ${index}`, nonce })
        .expect(201);

      expect(res.body.author.id).toBe(author.id);
      expect(res.body.author.passwordHash).toBeUndefined();
      expect(res.body.deletedAt).toBeUndefined();
      messageIds.push(res.body.id);
    }

    // Cùng (channel, author, nonce) → client retry, không phải tin mới.
    const retry = await api('post', `/api/v1/channels/${channelId}/messages`, author.token)
      .send({ content: 'noi dung khac han', nonce: nonces[0] })
      .expect(201);
    expect(retry.body.id).toBe(messageIds[0]);
    expect(retry.body.content).toBe('tin so 0');

    // T4.5 (hỗn loạn): HAI request cùng nonce ĐỒNG THỜI — một request kịp ghi, request kia
    // văng unique constraint và đi nhánh "trả lại tin cũ": cả hai cùng id, DB chỉ một hàng.
    const concurrentNonce = randomUUID();
    const [a, b] = await Promise.all([
      api('post', `/api/v1/channels/${channelId}/messages`, author.token).send({
        content: 'dual write',
        nonce: concurrentNonce,
      }),
      api('post', `/api/v1/channels/${channelId}/messages`, author.token).send({
        content: 'dual write',
        nonce: concurrentNonce,
      }),
    ]);
    expect([a.status, b.status].sort()).toEqual([201, 201]);
    expect(a.body.id).toBe(b.body.id);
    const db = app.get(PrismaService);
    const count = await db.message.count({
      where: { channelId: channelId, nonce: concurrentNonce },
    });
    expect(count).toBe(1);
    // Dọn tin của test này (xóa mềm) để không lệch đếm của các test phía sau.
    await api('delete', `/api/v1/messages/${a.body.id}`, author.token).expect(200);
  });

  it('GET messages — phân trang cursor: mới nhất trước, before kéo trang cũ hơn, hasMore đúng', async () => {
    const page1 = await api(
      'get',
      `/api/v1/channels/${channelId}/messages?limit=2`,
      author.token,
    ).expect(200);
    expect(page1.body.messages.map((message: { id: string }) => message.id)).toEqual([
      messageIds[4],
      messageIds[3],
    ]);
    expect(page1.body.hasMore).toBe(true);

    const page2 = await api(
      'get',
      `/api/v1/channels/${channelId}/messages?limit=2&before=${messageIds[3]}`,
      author.token,
    ).expect(200);
    expect(page2.body.messages.map((message: { id: string }) => message.id)).toEqual([
      messageIds[2],
      messageIds[1],
    ]);
    expect(page2.body.hasMore).toBe(true);

    const page3 = await api(
      'get',
      `/api/v1/channels/${channelId}/messages?limit=2&before=${messageIds[1]}`,
      author.token,
    ).expect(200);
    expect(page3.body.messages.map((message: { id: string }) => message.id)).toEqual([
      messageIds[0],
    ]);
    expect(page3.body.hasMore).toBe(false);
  });

  it('unique nonce là theo (channel, author): người khác dùng lại nonce vẫn gửi được tin riêng', async () => {
    const res = await api('post', `/api/v1/channels/${channelId}/messages`, other.token)
      .send({ content: 'tin cua other', nonce: nonces[0] })
      .expect(201);

    expect(res.body.id).not.toBe(messageIds[0]);
    expect(res.body.author.id).toBe(other.id);
    otherMessageId = res.body.id;
  });

  it('PATCH — member thường không sửa được tin người khác (403); tác giả sửa được tin mình; owner toàn quyền', async () => {
    // other là member thường: không phải tác giả và không có MANAGE_MESSAGES → 403.
    await api('patch', `/api/v1/messages/${messageIds[1]}`, other.token)
      .send({ content: 'sua len' })
      .expect(403);

    // Chính tác giả sửa tin mình thì được, và editedAt được đánh dấu.
    const own = await api('patch', `/api/v1/messages/${messageIds[1]}`, author.token)
      .send({ content: 'da sua' })
      .expect(200);
    expect(own.body.content).toBe('da sua');
    expect(own.body.editedAt).not.toBeNull();

    // Owner có `manage all` trong defineAbilityFor → sửa được cả tin của other.
    const byOwner = await api('patch', `/api/v1/messages/${otherMessageId}`, author.token)
      .send({ content: 'owner sua' })
      .expect(200);
    expect(byOwner.body.content).toBe('owner sua');
  });

  it('DELETE — tác giả xóa tin mình (soft delete, biến mất khỏi lịch sử)', async () => {
    await api('delete', `/api/v1/messages/${messageIds[0]}`, other.token).expect(403);
    await api('delete', `/api/v1/messages/${messageIds[0]}`, author.token).expect(200);

    const list = await api(
      'get',
      `/api/v1/channels/${channelId}/messages?limit=100`,
      author.token,
    ).expect(200);
    expect(list.body.messages.map((message: { id: string }) => message.id)).not.toContain(
      messageIds[0],
    );
    expect(list.body.messages).toHaveLength(5); // 5 gốc + 1 của other − 1 đã xóa
  });

  it('moderator có MANAGE_MESSAGES xóa được tin của người khác', async () => {
    await api('delete', `/api/v1/messages/${otherMessageId}`, moderator.token).expect(200);

    const list = await api(
      'get',
      `/api/v1/channels/${channelId}/messages?limit=100`,
      author.token,
    ).expect(200);
    expect(list.body.messages.map((message: { id: string }) => message.id)).not.toContain(
      otherMessageId,
    );
  });

  it('ghi outbox message.created/updated/deleted trong cùng transaction (T5.3)', async () => {
    const prisma = app.get(PrismaService);
    const events = await prisma.outboxEvent.findMany({
      where: {
        aggregateId: { in: [messageIds[0]!, messageIds[1]!, otherMessageId] },
        type: { in: ['message.created', 'message.updated', 'message.deleted'] },
      },
      select: { aggregateId: true, type: true },
      orderBy: { createdAt: 'asc' },
    });

    expect(events).toEqual(
      expect.arrayContaining([
        { aggregateId: messageIds[1], type: 'message.created' },
        { aggregateId: messageIds[1], type: 'message.updated' },
        { aggregateId: messageIds[0], type: 'message.deleted' },
        { aggregateId: otherMessageId, type: 'message.deleted' },
      ]),
    );
  });

  it('không phải member — không gửi, không đọc, không sửa/xóa được (403 ở guard)', async () => {
    await api('post', `/api/v1/channels/${channelId}/messages`, outsider.token)
      .send({ content: 'x', nonce: randomUUID() })
      .expect(403);
    await api('get', `/api/v1/channels/${channelId}/messages`, outsider.token).expect(403);
    await api('patch', `/api/v1/messages/${messageIds[1]}`, outsider.token)
      .send({ content: 'x' })
      .expect(403);
    await api('delete', `/api/v1/messages/${messageIds[1]}`, outsider.token).expect(403);
  });

  it('validation — thiếu nonce hoặc limit quá trần đều 400', async () => {
    await api('post', `/api/v1/channels/${channelId}/messages`, author.token)
      .send({ content: 'thieu nonce' })
      .expect(400);
    await api('get', `/api/v1/channels/${channelId}/messages?limit=1000`, author.token).expect(400);
    await api(
      'get',
      `/api/v1/channels/${channelId}/messages?before=khong-phai-uuid`,
      author.token,
    ).expect(400);
  });

  it('id trên URL không phải UUID → 400 VALIDATION_ERROR, không bao giờ 500 từ Postgres', async () => {
    const urls: [HttpMethod, string][] = [
      ['get', '/api/v1/servers/abc'],
      ['get', '/api/v1/channels/abc/messages'],
      ['patch', '/api/v1/messages/abc'],
      ['patch', '/api/v1/roles/abc'],
      ['put', `/api/v1/servers/${serverId}/members/abc/roles`],
    ];
    for (const [method, url] of urls) {
      const res = await api(method, url, author.token).send({ content: 'x', roleIds: [] });
      expect({ url, status: res.status, code: res.body.code }).toEqual({
        url,
        status: 400,
        code: 'VALIDATION_ERROR',
      });
    }
  });
  it('GET messages?after — gap recovery (T4.4): tin mới hơn cursor, thứ tự tăng dần, hasMore còn mới hơn; bỏ tin đã xóa; before+after → 400', async () => {
    // Hai tin mới riêng cho test này (không đụng messageIds của các test khác).
    const sent1 = await api('post', `/api/v1/channels/${channelId}/messages`, author.token)
      .send({ content: 'gap 1', nonce: randomUUID() })
      .expect(201);
    const sent2 = await api('post', `/api/v1/channels/${channelId}/messages`, author.token)
      .send({ content: 'gap 2', nonce: randomUUID() })
      .expect(201);

    const gap = await api(
      'get',
      `/api/v1/channels/${channelId}/messages?limit=1&after=${messageIds[4]}`,
      author.token,
    ).expect(200);
    expect(gap.body.messages.map((message: { id: string }) => message.id)).toEqual([sent1.body.id]);
    expect(gap.body.hasMore).toBe(true);

    const rest = await api(
      'get',
      `/api/v1/channels/${channelId}/messages?limit=1&after=${sent1.body.id}`,
      author.token,
    ).expect(200);
    expect(rest.body.messages.map((message: { id: string }) => message.id)).toEqual([
      sent2.body.id,
    ]);
    expect(rest.body.hasMore).toBe(false);

    // Tin bị xóa mềm không nằm trong khoảng trả về.
    await api('delete', `/api/v1/messages/${sent1.body.id}`, author.token).expect(200);
    const afterDelete = await api(
      'get',
      `/api/v1/channels/${channelId}/messages?after=${messageIds[4]}`,
      author.token,
    ).expect(200);
    expect(afterDelete.body.messages.map((message: { id: string }) => message.id)).not.toContain(
      sent1.body.id,
    );

    // Hai chiều cursor cùng lúc bị từ chối.
    await api(
      'get',
      `/api/v1/channels/${channelId}/messages?after=${messageIds[1]}&before=${messageIds[4]}`,
      author.token,
    ).expect(400);
  });
});
