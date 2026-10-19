import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
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

type HttpMethod = 'get' | 'post' | 'patch' | 'delete';

/** Request đồng thời và client retry không được làm hỏng dữ liệu hay trả 500. */
describe('Data integrity under retries and races (e2e)', () => {
  let app: INestApplication;
  const emails: string[] = [];
  let owner: TestUser;
  let joiner: TestUser;
  let serverId: string;
  let channelId: string;
  let inviteCode: string;

  async function registerUser(): Promise<TestUser> {
    const suffix = Math.random().toString(36).slice(2, 8);
    const email = `d-${runId}-${suffix}@ping.dev`;
    emails.push(email);
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, username: `d${runId}${suffix}`.slice(0, 32), password: 'password123' })
      .expect(201);
    return { id: res.body.user.id, token: res.body.accessToken };
  }

  function api(method: HttpMethod, url: string, token: string) {
    return request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    await app.init();
    await moduleRef.get(RedisProvider).flushdb();

    owner = await registerUser();
    joiner = await registerUser();
    const server = await api('post', '/api/v1/servers', owner.token)
      .send({ name: 'Integrity' })
      .expect(201);
    serverId = server.body.id;
    channelId = server.body.channels[0].id;
    inviteCode = server.body.inviteCode;
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

  it('join đồng thời hai lần → một 201, một 409 (không 500)', async () => {
    const results = await Promise.all(
      [1, 2, 3].map(() => api('post', '/api/v1/servers/join', joiner.token).send({ inviteCode })),
    );
    expect(results.map((res) => res.status).sort()).toEqual([201, 409, 409]);
  });

  it('tin đã xóa mềm thì không sửa/xóa lại được (404)', async () => {
    const message = await api('post', `/api/v1/channels/${channelId}/messages`, owner.token)
      .send({ content: 'sap bi xoa', nonce: randomUUID() })
      .expect(201);
    await api('delete', `/api/v1/messages/${message.body.id}`, owner.token).expect(200);

    await api('patch', `/api/v1/messages/${message.body.id}`, owner.token)
      .send({ content: 'hoi sinh' })
      .expect(404);
    await api('delete', `/api/v1/messages/${message.body.id}`, owner.token).expect(404);
  });

  it('tạo channel đồng thời → position không trùng nhau', async () => {
    const results = await Promise.all(
      ['a', 'b', 'c', 'd'].map((name) =>
        api('post', `/api/v1/servers/${serverId}/channels`, owner.token).send({ name }).expect(201),
      ),
    );
    const positions = results.map((res) => res.body.position);
    expect(new Set(positions).size).toBe(positions.length);
  });

  it('Idempotency-Key: retry POST /servers trả đúng server cũ, không tạo bản thứ hai', async () => {
    const key = randomUUID();
    const create = () =>
      api('post', '/api/v1/servers', owner.token)
        .set('Idempotency-Key', key)
        .send({ name: 'Retry me' });

    const first = await create().expect(201);
    const retry = await create().expect(201);
    expect(retry.body.id).toBe(first.body.id);

    const mine = await api('get', '/api/v1/servers', owner.token).expect(200);
    expect(mine.body.filter((server: { name: string }) => server.name === 'Retry me')).toHaveLength(
      1,
    );

    // Cùng key nhưng người khác: không đụng nhau.
    const other = await api('post', '/api/v1/servers', joiner.token)
      .set('Idempotency-Key', key)
      .send({ name: 'Retry me' })
      .expect(201);
    expect(other.body.id).not.toBe(first.body.id);
  });

  it('Idempotency-Key sai định dạng → 400', async () => {
    await api('post', '/api/v1/servers', owner.token)
      .set('Idempotency-Key', 'not-a-uuid')
      .send({ name: 'x' })
      .expect(400);
  });
});
