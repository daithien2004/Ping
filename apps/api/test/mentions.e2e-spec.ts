import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Test } from '@nestjs/testing';
import { Permissions } from '@ping/shared';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { RedisProvider } from '../src/infra/redis/redis.module.js';

const runId = Date.now().toString(36);

interface TestUser {
  id: string;
  token: string;
}

type HttpMethod = 'get' | 'post' | 'patch' | 'put' | 'delete';

/**
 * T4.1: mention được server parse khi tạo/sửa tin, @everyone/@role chỉ ghi khi người gửi
 * có MENTION_EVERYONE (ADR-0043). Kiểm tra trực tiếp bảng MessageMention vì T4.1 chưa đưa
 * mention ra DTO/event (thuộc T4.2). Dùng đúng 4 user (trần register 5/phút/IP).
 */
describe('Mentions (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const emails: string[] = [];

  let owner: TestUser;
  let plain: TestUser;
  let privileged: TestUser;
  let outsider: TestUser; // tồn tại nhưng KHÔNG thuộc server
  let serverId: string;
  let channelId: string;
  let roleId: string;
  let privilegedMemberId: string;

  const uniqueSuffix = () => Math.random().toString(36).slice(2, 8);

  async function registerUser(): Promise<TestUser> {
    const email = `m-${runId}-${uniqueSuffix()}@ping.dev`;
    const username = `m${runId}${uniqueSuffix()}`.slice(0, 32);
    emails.push(email);
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, username, password: 'password123', displayName: 'E2E' })
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

  async function send(token: string, content: string): Promise<string> {
    const res = await api('post', `/api/v1/channels/${channelId}/messages`, token)
      .send({ content, nonce: randomUUID() })
      .expect(201);
    return res.body.id as string;
  }

  const mentionsOf = (messageId: string) =>
    prisma.messageMention.findMany({ where: { messageId } });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    await app.init();
    prisma = app.get(PrismaService);
    await app.get(RedisProvider).flushdb();

    owner = await registerUser();
    plain = await registerUser();
    privileged = await registerUser();
    outsider = await registerUser();
  });

  afterAll(async () => {
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

  it('dựng server: role có MENTION_EVERYONE cho privileged, plain không có quyền gì', async () => {
    const created = await api('post', '/api/v1/servers', owner.token)
      .send({ name: 'Mention Test' })
      .expect(201);
    serverId = created.body.id;
    channelId = created.body.channels[0].id;

    const role = await api('post', `/api/v1/servers/${serverId}/roles`, owner.token)
      .send({
        name: 'mods',
        permissions: (
          Permissions.VIEW_CHANNEL |
          Permissions.SEND_MESSAGES |
          Permissions.MENTION_EVERYONE
        ).toString(),
      })
      .expect(201);
    roleId = role.body.id;

    for (const user of [plain, privileged]) {
      await api('post', '/api/v1/servers/join', user.token)
        .send({ inviteCode: created.body.inviteCode })
        .expect(201);
    }
    const members = await api('get', `/api/v1/servers/${serverId}/members`, owner.token).expect(
      200,
    );
    const target = members.body.members.find((m: { userId: string }) => m.userId === privileged.id);
    privilegedMemberId = target.id;
    await api('put', `/api/v1/servers/${serverId}/members/${privilegedMemberId}/roles`, owner.token)
      .send({ roleIds: [roleId] })
      .expect(200);
  });

  it('@user tạo hàng mention; user tồn tại nhưng không thuộc server thì không', async () => {
    const usernameOf = async (userId: string) => {
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { username: true },
      });
      return user.username;
    };
    const plainName = await usernameOf(plain.id);
    const outsiderName = await usernameOf(outsider.id);

    const messageId = await send(plain.token, `chào @${plainName} và @${outsiderName}`);
    const rows = await mentionsOf(messageId);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: 'user' });
    // mention user do member id đánh dấu, không phải user ngoài server.
    const mentioned = await prisma.messageMention.findFirstOrThrow({
      where: { messageId },
      select: { mentionedMember: { select: { userId: true } } },
    });
    expect(mentioned.mentionedMember?.userId).toBe(plain.id);
  });

  it('@everyone/@role không được ghi khi người gửi thiếu MENTION_EVERYONE (tin vẫn gửi)', async () => {
    const messageId = await send(plain.token, '@everyone họp giờ, @mods nhớ tới');
    expect(await mentionsOf(messageId)).toHaveLength(0);
  });

  it('có MENTION_EVERYONE thì @everyone và @role đều được ghi', async () => {
    const messageId = await send(privileged.token, '@everyone họp giờ, @mods nhớ tới');
    const rows = await mentionsOf(messageId);
    expect(rows.map((row) => row.kind).sort()).toEqual(['everyone', 'role']);
    expect(rows.find((row) => row.kind === 'role')?.roleId).toBe(roleId);
  });

  it('owner ngầm có quyền: @everyone được ghi', async () => {
    const messageId = await send(owner.token, '@everyone test');
    expect((await mentionsOf(messageId)).map((row) => row.kind)).toEqual(['everyone']);
  });

  it('email trong nội dung không sinh mention', async () => {
    const messageId = await send(owner.token, 'gửi cho alice@example.com nhé');
    expect(await mentionsOf(messageId)).toHaveLength(0);
  });

  it('sửa tin cập nhật mention: bỏ mention cũ, ghi mention mới', async () => {
    const usernameOf = async (userId: string) => {
      const user = await prisma.user.findUniqueOrThrow({
        where: { id: userId },
        select: { username: true },
      });
      return user.username;
    };
    const privilegedName = await usernameOf(privileged.id);
    const messageId = await send(owner.token, `@${privilegedName} ơi`);
    expect(await mentionsOf(messageId)).toHaveLength(1);

    // Sửa thành nhắc @everyone (owner có quyền): hàng user biến mất, hàng everyone xuất hiện.
    await api('patch', `/api/v1/messages/${messageId}`, owner.token)
      .send({ content: '@everyone thay đổi' })
      .expect(200);
    const afterUpdate = await mentionsOf(messageId);
    expect(afterUpdate.map((row) => row.kind)).toEqual(['everyone']);

    // Sửa tiếp thành nội dung không có mention: sạch hàng.
    await api('patch', `/api/v1/messages/${messageId}`, owner.token)
      .send({ content: 'không còn mention' })
      .expect(200);
    expect(await mentionsOf(messageId)).toHaveLength(0);
  });

  it('xóa mềm tin: hàng mention còn lại nhưng tin đã có deletedAt — T4.2 đếm unread phải join theo tin chưa xóa', async () => {
    const messageId = await send(owner.token, '@everyone sẽ bị xóa');
    expect(await mentionsOf(messageId)).toHaveLength(1);
    await api('delete', `/api/v1/messages/${messageId}`, owner.token).expect(200);
    // Soft delete (moderation cần lịch sử): hàng mention không bị xoá vật lý, nhưng
    // mọi phép đếm unread/mention sau này phải ràng buộc `message.deletedAt = null`.
    const message = await prisma.message.findUniqueOrThrow({
      where: { id: messageId },
      select: { deletedAt: true },
    });
    expect(message.deletedAt).not.toBeNull();
    expect(await mentionsOf(messageId)).toHaveLength(1);
  });
});
