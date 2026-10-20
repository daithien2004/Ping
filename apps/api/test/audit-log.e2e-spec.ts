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
  token: string;
}

type HttpMethod = 'get' | 'post' | 'patch' | 'put' | 'delete';

/** Quy tắc 11: hành động nhạy cảm phải để lại AuditLog, kèm requestId của request gây ra nó. */
describe('Audit log (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const emails: string[] = [];
  let owner: TestUser;
  let author: TestUser;
  let moderator: TestUser;
  let serverId: string;
  let channelId: string;
  let roleId: string;

  async function registerUser(): Promise<TestUser> {
    const suffix = Math.random().toString(36).slice(2, 8);
    const email = `a-${runId}-${suffix}@ping.dev`;
    emails.push(email);
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, username: `a${runId}${suffix}`.slice(0, 32), password: 'password123' })
      .expect(201);
    return { id: res.body.user.id, token: res.body.accessToken };
  }

  function api(method: HttpMethod, url: string, token: string, requestId = randomUUID()) {
    return request(app.getHttpServer())
      [method](url)
      .set('Authorization', `Bearer ${token}`)
      .set('X-Request-Id', requestId);
  }

  function logs(action: string) {
    return prisma.auditLog.findMany({ where: { serverId, action: action as never } });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    await app.init();
    await moduleRef.get(RedisProvider).flushdb();
    prisma = app.get(PrismaService);

    owner = await registerUser();
    author = await registerUser();
    moderator = await registerUser();

    const server = await api('post', '/api/v1/servers', owner.token)
      .send({ name: 'Audited' })
      .expect(201);
    serverId = server.body.id;
    channelId = server.body.channels[0].id;
    for (const user of [author, moderator]) {
      await api('post', '/api/v1/servers/join', user.token)
        .send({ inviteCode: server.body.inviteCode })
        .expect(201);
    }
  });

  afterAll(async () => {
    const users = await prisma.user.findMany({
      where: { email: { in: emails } },
      select: { id: true },
    });
    const userIds = users.map((user) => user.id);
    await prisma.auditLog.deleteMany({ where: { serverId } });
    await prisma.message.deleteMany({ where: { authorId: { in: userIds } } });
    await prisma.server.deleteMany({ where: { ownerId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it('tạo, sửa role và gán role đều được ghi, kèm actor và requestId', async () => {
    const createRequestId = randomUUID();
    const role = await api(
      'post',
      `/api/v1/servers/${serverId}/roles`,
      owner.token,
      createRequestId,
    )
      .send({
        name: 'mod',
        permissions: (Permissions.VIEW_CHANNEL | Permissions.MANAGE_MESSAGES).toString(),
      })
      .expect(201);
    roleId = role.body.id;

    expect(await logs('ROLE_CREATE')).toEqual([
      expect.objectContaining({ actorId: owner.id, targetId: roleId, requestId: createRequestId }),
    ]);

    await api('patch', `/api/v1/roles/${roleId}`, owner.token)
      .send({ name: 'moderator' })
      .expect(200);
    const [update] = await logs('ROLE_UPDATE');
    expect(update?.metadata).toMatchObject({
      before: { name: 'mod' },
      after: { name: 'moderator' },
    });

    const members = await api('get', `/api/v1/servers/${serverId}/members`, owner.token).expect(
      200,
    );
    const moderatorMember = members.body.members.find(
      (m: { userId: string }) => m.userId === moderator.id,
    );
    await api('put', `/api/v1/servers/${serverId}/members/${moderatorMember.id}/roles`, owner.token)
      .send({ roleIds: [roleId] })
      .expect(200);
    expect(await logs('MEMBER_ROLES_UPDATE')).toEqual([
      expect.objectContaining({ actorId: owner.id, targetId: moderatorMember.id }),
    ]);
  });

  it('xóa tin của người khác được ghi; tác giả tự xóa tin mình thì không', async () => {
    const post = () =>
      api('post', `/api/v1/channels/${channelId}/messages`, author.token)
        .send({ content: 'x', nonce: randomUUID() })
        .expect(201);
    const own = await post();
    const other = await post();

    await api('delete', `/api/v1/messages/${own.body.id}`, author.token).expect(200);
    await api('delete', `/api/v1/messages/${other.body.id}`, moderator.token).expect(200);

    expect(await logs('MESSAGE_DELETE')).toEqual([
      expect.objectContaining({
        actorId: moderator.id,
        targetId: other.body.id,
        metadata: expect.objectContaining({ authorId: author.id }),
      }),
    ]);
  });

  it('xóa role, xóa channel, xóa server đều được ghi; log còn sau khi server bị xóa', async () => {
    await api('delete', `/api/v1/roles/${roleId}`, owner.token).expect(200);
    const channel = await api('post', `/api/v1/servers/${serverId}/channels`, owner.token)
      .send({ name: 'temp' })
      .expect(201);
    await api('delete', `/api/v1/channels/${channel.body.id}`, owner.token).expect(200);
    await api('delete', `/api/v1/servers/${serverId}`, owner.token).expect(200);

    expect(await logs('ROLE_DELETE')).toHaveLength(1);
    expect(await logs('CHANNEL_DELETE')).toEqual([
      expect.objectContaining({ targetId: channel.body.id, metadata: { name: 'temp' } }),
    ]);
    expect(await logs('SERVER_DELETE')).toEqual([
      expect.objectContaining({ actorId: owner.id, targetId: serverId }),
    ]);
  });
});
