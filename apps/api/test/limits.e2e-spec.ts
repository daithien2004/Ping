import type { INestApplication } from '@nestjs/common';
import { ErrorCodes, Limits } from '@ping/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { RedisProvider } from '../src/infra/redis/redis.module.js';
import { bootApp } from './helpers/boot.js';

/**
 * Trần số lượng (ADR-0028). Đưa DB gần sát trần bằng Prisma (200 request qua API sẽ chạm rate
 * limit), rồi kiểm tra ở ranh giới: lần cuối còn được, lần kế tiếp bị từ chối.
 */
const runId = Date.now().toString(36);

describe('limits (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const emails: string[] = [];
  let token = '';
  let userId = '';
  let serverId = '';

  const call = (verb: 'post' | 'get', url: string, body?: object) => {
    const req = request(app.getHttpServer())
      [verb](`/api/v1${url}`)
      .set('Authorization', `Bearer ${token}`);
    return body ? req.send(body) : req;
  };

  beforeAll(async () => {
    app = await bootApp();
    prisma = app.get(PrismaService);
    await app.get(RedisProvider).flushdb();
    const email = `limits-${runId}@ping.dev`;
    emails.push(email);
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, username: `lim${runId}`.slice(0, 32), password: 'password123' })
      .expect(201);
    token = res.body.accessToken;
    userId = res.body.user.id;
    serverId = (await call('post', '/servers', { name: 'limits' }).expect(201)).body.id;
  });

  afterAll(async () => {
    const users = await prisma.user.findMany({
      where: { email: { in: emails } },
      select: { id: true },
    });
    const ids = users.map((user) => user.id);
    await prisma.server.deleteMany({ where: { ownerId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  function expectLimit(res: request.Response, path: string) {
    expect(res.status).toBe(400);
    expect(res.body.code).toBe(ErrorCodes.VALIDATION_ERROR);
    expect(res.body.requestId).toBeTruthy();
    expect(res.body.details[0]).toMatchObject({ path, code: 'too_big' });
  }

  it(`a server holds at most ${Limits.MAX_CHANNELS_PER_SERVER} channels`, async () => {
    const existing = await prisma.channel.count({ where: { serverId } });
    await prisma.channel.createMany({
      data: Array.from({ length: Limits.MAX_CHANNELS_PER_SERVER - existing - 1 }, (_, index) => ({
        serverId,
        name: `c${index}`,
        position: existing + index,
      })),
    });
    await call('post', `/servers/${serverId}/channels`, { name: 'the-200th' }).expect(201);
    expectLimit(
      await call('post', `/servers/${serverId}/channels`, { name: 'one-too-many' }),
      'channels',
    );
    expect((await call('get', `/servers/${serverId}/channels`).expect(200)).body).toHaveLength(
      Limits.MAX_CHANNELS_PER_SERVER,
    );
  });

  it(`a server holds at most ${Limits.MAX_ROLES_PER_SERVER} roles (@everyone included)`, async () => {
    const existing = await prisma.role.count({ where: { serverId } });
    await prisma.role.createMany({
      data: Array.from({ length: Limits.MAX_ROLES_PER_SERVER - existing - 1 }, (_, index) => ({
        serverId,
        name: `r${index}`,
        position: index + 1,
      })),
    });
    await call('post', `/servers/${serverId}/roles`, { name: 'the-100th' }).expect(201);
    expectLimit(
      await call('post', `/servers/${serverId}/roles`, { name: 'one-too-many' }),
      'roles',
    );
  });

  it(`a user belongs to at most ${Limits.MAX_SERVERS_PER_USER} servers: creating and joining are refused beyond that`, async () => {
    const existing = await prisma.member.count({ where: { userId } });
    const servers = Array.from(
      { length: Limits.MAX_SERVERS_PER_USER - existing - 1 },
      (_, index) => ({
        id: randomUUID(),
        name: `bulk-${index}`,
        ownerId: userId,
        inviteCode: `bulk-${runId}-${index}`,
      }),
    );
    await prisma.server.createMany({ data: servers });
    await prisma.member.createMany({
      data: servers.map((server) => ({ serverId: server.id, userId })),
    });

    await call('post', '/servers', { name: 'the-100th-server' }).expect(201);
    expectLimit(await call('post', '/servers', { name: 'one-too-many' }), 'servers');

    // Tham gia bằng mã mời cũng bị chặn (server của người khác). Join tra mã ở bảng
    // ServerInvite (T3.6) nên phải tạo luôn bản ghi mã đang hoạt động.
    const other = await prisma.user.findFirstOrThrow({ where: { email: { not: emails[0] } } });
    const foreign = await prisma.server.create({
      data: {
        name: 'foreign',
        ownerId: other.id,
        inviteCode: `foreign-${runId}`,
        invites: { create: { code: `foreign-${runId}`, createdById: other.id } },
      },
    });
    try {
      expectLimit(
        await call('post', '/servers/join', { inviteCode: foreign.inviteCode }),
        'servers',
      );
    } finally {
      await prisma.server.delete({ where: { id: foreign.id } });
    }
  });
});
