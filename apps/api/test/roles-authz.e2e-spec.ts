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

type HttpMethod = 'get' | 'post' | 'patch' | 'put' | 'delete';

/**
 * Phân quyền role: IDOR trên /roles/:roleId, leo thang đặc quyền qua MANAGE_ROLES,
 * và gán role không được làm member mất quyền của @everyone.
 */
describe('Role authorization (e2e)', () => {
  let app: INestApplication;
  const emails: string[] = [];

  let owner: TestUser;
  let manager: TestUser; // chỉ có VIEW_CHANNEL | SEND_MESSAGES | MANAGE_ROLES
  let member: TestUser;
  let outsider: TestUser;
  let serverId: string;
  let adminRoleId: string;
  let managerRoleId: string;

  async function registerUser(): Promise<TestUser> {
    const suffix = Math.random().toString(36).slice(2, 8);
    const email = `r-${runId}-${suffix}@ping.dev`;
    emails.push(email);
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, username: `r${runId}${suffix}`.slice(0, 32), password: 'password123' })
      .expect(201);
    return { id: res.body.user.id, token: res.body.accessToken };
  }

  function api(method: HttpMethod, url: string, token: string) {
    return request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);
  }

  async function memberIdOf(user: TestUser): Promise<string> {
    const res = await api('get', `/api/v1/servers/${serverId}/members`, owner.token).expect(200);
    return res.body.find((item: { userId: string }) => item.userId === user.id).id;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    await app.init();
    await moduleRef.get(RedisProvider).flushdb();

    owner = await registerUser();
    manager = await registerUser();
    member = await registerUser();
    outsider = await registerUser();

    const server = await api('post', '/api/v1/servers', owner.token)
      .send({ name: 'Roles Authz' })
      .expect(201);
    serverId = server.body.id;
    for (const user of [manager, member]) {
      await api('post', '/api/v1/servers/join', user.token)
        .send({ inviteCode: server.body.inviteCode })
        .expect(201);
    }

    const adminRole = await api('post', `/api/v1/servers/${serverId}/roles`, owner.token)
      .send({ name: 'admin', permissions: Permissions.ADMINISTRATOR.toString() })
      .expect(201);
    adminRoleId = adminRole.body.id;

    const managerRole = await api('post', `/api/v1/servers/${serverId}/roles`, owner.token)
      .send({
        name: 'role-manager',
        permissions: (
          Permissions.VIEW_CHANNEL |
          Permissions.SEND_MESSAGES |
          Permissions.MANAGE_ROLES
        ).toString(),
      })
      .expect(201);
    managerRoleId = managerRole.body.id;

    await api(
      'put',
      `/api/v1/servers/${serverId}/members/${await memberIdOf(manager)}/roles`,
      owner.token,
    )
      .send({ roleIds: [managerRoleId] })
      .expect(200);
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

  it('IDOR — người ngoài server không sửa/xóa được role qua /roles/:roleId', async () => {
    await api('patch', `/api/v1/roles/${adminRoleId}`, outsider.token)
      .send({ name: 'pwned', permissions: '0' })
      .expect(403);
    await api('delete', `/api/v1/roles/${adminRoleId}`, outsider.token).expect(403);

    const roles = await api('get', `/api/v1/servers/${serverId}/roles`, owner.token).expect(200);
    expect(roles.body.find((role: { id: string }) => role.id === adminRoleId)).toMatchObject({
      name: 'admin',
      permissions: Permissions.ADMINISTRATOR.toString(),
    });
  });

  it('IDOR — member thường (không MANAGE_ROLES) không sửa được role qua /roles/:roleId', async () => {
    await api('patch', `/api/v1/roles/${managerRoleId}`, member.token)
      .send({ permissions: Permissions.ADMINISTRATOR.toString() })
      .expect(403);
  });

  it('MANAGE_ROLES không cấp được quyền mình không có', async () => {
    await api('post', `/api/v1/servers/${serverId}/roles`, manager.token)
      .send({ name: 'escalate', permissions: Permissions.ADMINISTRATOR.toString() })
      .expect(403);
    await api('post', `/api/v1/servers/${serverId}/roles`, manager.token)
      .send({ name: 'escalate', permissions: Permissions.MANAGE_CHANNELS.toString() })
      .expect(403);
    await api('patch', `/api/v1/roles/${managerRoleId}`, manager.token)
      .send({ permissions: Permissions.ADMINISTRATOR.toString() })
      .expect(403);

    // Tập con quyền của chính mình thì được.
    await api('post', `/api/v1/servers/${serverId}/roles`, manager.token)
      .send({ name: 'reader', permissions: Permissions.VIEW_CHANNEL.toString() })
      .expect(201);
  });

  it('MANAGE_ROLES không đụng được role hay member mạnh hơn mình', async () => {
    await api('patch', `/api/v1/roles/${adminRoleId}`, manager.token)
      .send({ name: 'renamed' })
      .expect(403);
    await api('delete', `/api/v1/roles/${adminRoleId}`, manager.token).expect(403);

    // Tự gán role admin cho mình.
    await api(
      'put',
      `/api/v1/servers/${serverId}/members/${await memberIdOf(manager)}/roles`,
      manager.token,
    )
      .send({ roleIds: [managerRoleId, adminRoleId] })
      .expect(403);

    // Đổi role của owner.
    await api(
      'put',
      `/api/v1/servers/${serverId}/members/${await memberIdOf(owner)}/roles`,
      manager.token,
    )
      .send({ roleIds: [] })
      .expect(403);
  });

  it('gán role không làm member mất quyền của @everyone', async () => {
    const tag = await api('post', `/api/v1/servers/${serverId}/roles`, manager.token)
      .send({ name: 'tag', permissions: '0' })
      .expect(201);

    const assigned = await api(
      'put',
      `/api/v1/servers/${serverId}/members/${await memberIdOf(member)}/roles`,
      manager.token,
    )
      .send({ roleIds: [tag.body.id] })
      .expect(200);
    expect(
      assigned.body.roles.map((entry: { role: { name: string } }) => entry.role.name).sort(),
    ).toEqual(['@everyone', 'tag']);

    // @everyone mang VIEW_CHANNEL: member vẫn xem được channel.
    await api('get', `/api/v1/servers/${serverId}/channels`, member.token).expect(200);
  });
});
