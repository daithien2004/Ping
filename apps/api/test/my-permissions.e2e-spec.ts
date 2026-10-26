import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Permissions, type MyServerPermissions } from '@ping/shared';
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

/** GET /servers/:serverId/me/permissions — frontend dựng ability từ đây (hướng dẫn 12.5.1). */
describe('My permissions in a server (e2e)', () => {
  let app: INestApplication;
  const emails: string[] = [];
  let owner: TestUser;
  let member: TestUser;
  let outsider: TestUser;
  let serverId: string;

  async function registerUser(): Promise<TestUser> {
    const suffix = Math.random().toString(36).slice(2, 8);
    const email = `p-${runId}-${suffix}@ping.dev`;
    emails.push(email);
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, username: `p${runId}${suffix}`.slice(0, 32), password: 'password123' })
      .expect(201);
    return { id: res.body.user.id, token: res.body.accessToken };
  }

  const myPermissions = (id: string, user: TestUser) =>
    request(app.getHttpServer())
      .get(`/api/v1/servers/${id}/me/permissions`)
      .set('Authorization', `Bearer ${user.token}`);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    await app.init();
    await moduleRef.get(RedisProvider).flushdb();

    owner = await registerUser();
    member = await registerUser();
    outsider = await registerUser();
    const server = await request(app.getHttpServer())
      .post('/api/v1/servers')
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ name: 'Perms' })
      .expect(201);
    serverId = server.body.id;
    await request(app.getHttpServer())
      .post('/api/v1/servers/join')
      .set('Authorization', `Bearer ${member.token}`)
      .send({ inviteCode: server.body.inviteCode })
      .expect(201);
  });

  afterAll(async () => {
    const prisma = app.get(PrismaService);
    const users = await prisma.user.findMany({
      where: { email: { in: emails } },
      select: { id: true },
    });
    const userIds = users.map((user) => user.id);
    await prisma.server.deleteMany({ where: { ownerId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it('member nhận quyền hiệu lực của mình (gồm @everyone), bigint dạng chuỗi', async () => {
    const res = await myPermissions(serverId, member).expect(200);
    const expected: MyServerPermissions = {
      isOwner: false,
      permissions: (
        Permissions.VIEW_CHANNEL |
        Permissions.SEND_MESSAGES |
        Permissions.ADD_REACTIONS
      ).toString(),
    };
    expect(res.body).toEqual(expected);
  });

  it('owner có isOwner = true', async () => {
    const res = await myPermissions(serverId, owner).expect(200);
    expect(res.body.isOwner).toBe(true);
  });

  it('người ngoài server bị chặn (403), id sai định dạng → 400', async () => {
    await myPermissions(serverId, outsider).expect(403);
    await myPermissions('khong-phai-uuid', member).expect(400);
  });
});
