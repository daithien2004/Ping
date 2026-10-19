import type { INestApplication } from '@nestjs/common';
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

type HttpMethod = 'get' | 'post' | 'put' | 'delete';

/** Kick member: DELETE /servers/:serverId/members/:memberId. */
describe('Kick member (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const emails: string[] = [];

  let owner: TestUser;
  let kicker: TestUser; // KICK_MEMBERS
  let victim: TestUser; // chỉ @everyone
  let strong: TestUser; // ADMINISTRATOR ở server A, owner server B
  let serverA: string;
  let inviteA: string;
  let serverB: string;

  async function registerUser(): Promise<TestUser> {
    const suffix = Math.random().toString(36).slice(2, 8);
    const email = `k-${runId}-${suffix}@ping.dev`;
    emails.push(email);
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, username: `k${runId}${suffix}`.slice(0, 32), password: 'password123' })
      .expect(201);
    return { id: res.body.user.id, token: res.body.accessToken };
  }

  function api(method: HttpMethod, url: string, token: string) {
    return request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);
  }

  async function memberIdOf(serverId: string, user: TestUser, as: TestUser): Promise<string> {
    const res = await api('get', `/api/v1/servers/${serverId}/members`, as.token).expect(200);
    return res.body.find((m: { userId: string }) => m.userId === user.id).id;
  }

  async function giveRole(user: TestUser, permissions: bigint) {
    const role = await api('post', `/api/v1/servers/${serverA}/roles`, owner.token)
      .send({ name: `r-${permissions}`, permissions: permissions.toString() })
      .expect(201);
    await api(
      'put',
      `/api/v1/servers/${serverA}/members/${await memberIdOf(serverA, user, owner)}/roles`,
      owner.token,
    )
      .send({ roleIds: [role.body.id] })
      .expect(200);
  }

  const kick = (serverId: string, memberId: string, as: TestUser) =>
    api('delete', `/api/v1/servers/${serverId}/members/${memberId}`, as.token);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    await app.init();
    await moduleRef.get(RedisProvider).flushdb();
    prisma = app.get(PrismaService);

    owner = await registerUser();
    kicker = await registerUser();
    victim = await registerUser();
    strong = await registerUser();

    const a = await api('post', '/api/v1/servers', owner.token).send({ name: 'A' }).expect(201);
    serverA = a.body.id;
    inviteA = a.body.inviteCode;
    for (const user of [kicker, victim, strong]) {
      await api('post', '/api/v1/servers/join', user.token)
        .send({ inviteCode: inviteA })
        .expect(201);
    }
    await giveRole(kicker, Permissions.VIEW_CHANNEL | Permissions.KICK_MEMBERS);
    await giveRole(strong, Permissions.ADMINISTRATOR);

    const b = await api('post', '/api/v1/servers', strong.token).send({ name: 'B' }).expect(201);
    serverB = b.body.id;
  });

  afterAll(async () => {
    const users = await prisma.user.findMany({
      where: { email: { in: emails } },
      select: { id: true },
    });
    const userIds = users.map((user) => user.id);
    await prisma.auditLog.deleteMany({ where: { serverId: { in: [serverA, serverB] } } });
    await prisma.server.deleteMany({ where: { ownerId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it('member không có KICK_MEMBERS không kick được (403)', async () => {
    await kick(serverA, await memberIdOf(serverA, kicker, owner), victim).expect(403);
  });

  it('không kick được owner, người mạnh hơn mình; tự kick mình → 400 (dùng leave)', async () => {
    await kick(serverA, await memberIdOf(serverA, owner, owner), kicker).expect(403);
    await kick(serverA, await memberIdOf(serverA, strong, owner), kicker).expect(403);
    await kick(serverA, await memberIdOf(serverA, kicker, owner), kicker).expect(400);
  });

  it('IDOR: không kick được member của server khác', async () => {
    const strongInB = await memberIdOf(serverB, strong, strong);
    // Không phải member server B.
    await kick(serverB, strongInB, kicker).expect(403);
    // memberId của server B nhưng gắn vào URL server A.
    await kick(serverA, strongInB, kicker).expect(404);
  });

  it('kick thành công: mất quyền ngay, có AuditLog, vẫn vào lại được bằng invite', async () => {
    const victimMemberId = await memberIdOf(serverA, victim, owner);
    // Làm nóng cache ability của victim để chắc chắn kick có xóa cache.
    await api('get', `/api/v1/servers/${serverA}/channels`, victim.token).expect(200);

    await kick(serverA, victimMemberId, kicker).expect(204);

    await api('get', `/api/v1/servers/${serverA}/channels`, victim.token).expect(403);
    expect(
      await prisma.auditLog.findMany({ where: { serverId: serverA, action: 'MEMBER_KICK' } }),
    ).toEqual([
      expect.objectContaining({
        actorId: kicker.id,
        targetId: victimMemberId,
        metadata: { userId: victim.id },
      }),
    ]);

    // Kick không phải ban.
    await api('post', '/api/v1/servers/join', victim.token)
      .send({ inviteCode: inviteA })
      .expect(201);
  });
});
