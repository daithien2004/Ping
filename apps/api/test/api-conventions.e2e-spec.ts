import type { INestApplication } from '@nestjs/common';
import { ErrorCodes, isErrorCode } from '@ping/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { RedisProvider } from '../src/infra/redis/redis.module.js';
import { bootApp } from './helpers/boot.js';

/**
 * Tuân thủ docs/api-conventions.md (hướng dẫn 16.7, ADR-0028): chạy trên app thật và đo hành vi
 * thật của API. Test này là nơi quy ước được kiểm tra bằng máy; viết lại quy ước thì sửa test này.
 */
const runId = Date.now().toString(36);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const CAMEL = /^[a-z][a-zA-Z0-9]*$/;

interface Actor {
  id: string;
  email: string;
  token: string;
}

describe('API conventions (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisProvider;
  const emails: string[] = [];

  let alice: Actor; // chủ server A
  let carol: Actor; // thành viên thường
  let dan: Actor; // người ngoài
  let serverId = '';
  let inviteCode = '';
  let channelId = '';
  let roleId = '';
  let messageId = '';
  let carolMemberId = '';

  const http = () => request(app.getHttpServer());
  const call = (
    verb: 'get' | 'post' | 'patch' | 'put' | 'delete',
    url: string,
    actor?: Actor,
    body?: object,
  ) => {
    const req = http()[verb](`/api/v1${url}`);
    if (actor) req.set('Authorization', `Bearer ${actor.token}`);
    return body ? req.send(body) : req;
  };
  async function register(label: string): Promise<Actor> {
    const email = `conv-${label}-${runId}@ping.dev`;
    emails.push(email);
    const res = await http()
      .post('/api/v1/auth/register')
      .send({ email, username: `cv${label}${runId}`.slice(0, 32), password: 'password123' })
      .expect(201);
    return { id: res.body.user.id, email, token: res.body.accessToken };
  }

  beforeAll(async () => {
    app = await bootApp();
    prisma = app.get(PrismaService);
    redis = app.get(RedisProvider);
    await redis.flushdb();
    [alice, carol, dan] = await Promise.all([register('a'), register('c'), register('d')]);

    const server = await call('post', '/servers', alice, { name: `conv-${runId}` }).expect(201);
    serverId = server.body.id;
    inviteCode = server.body.inviteCode;
    channelId = server.body.channels[0].id;
    roleId = (
      await call('post', `/servers/${serverId}/roles`, alice, {
        name: 'mod',
        permissions: '4',
      }).expect(201)
    ).body.id;
    await call('post', '/servers/join', carol, { inviteCode }).expect(201);
    messageId = (
      await call('post', `/channels/${channelId}/messages`, alice, {
        content: 'hello',
        nonce: randomUUID(),
      }).expect(201)
    ).body.id;
    const members = (await call('get', `/servers/${serverId}/members`, alice).expect(200)).body;
    carolMemberId = members.members.find((m: { userId: string }) => m.userId === carol.id).id;
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

  describe('errors: { code, message, requestId, details? } with a catalog code', () => {
    /** [mô tả, status mong đợi, mã mong đợi, hàm gây lỗi] */
    const cases: Array<[string, number, string[], () => Promise<request.Response>]> = [
      [
        'invalid body',
        400,
        [ErrorCodes.VALIDATION_ERROR],
        () => call('post', '/auth/login', undefined, { email: 'nope' }),
      ],
      [
        'malformed uuid in the path',
        400,
        [ErrorCodes.VALIDATION_ERROR],
        () => call('get', '/servers/not-a-uuid', alice),
      ],
      [
        'invalid query value',
        400,
        [ErrorCodes.VALIDATION_ERROR],
        () => call('get', `/channels/${channelId}/messages?limit=0`, alice),
      ],
      [
        'malformed JSON',
        400,
        [ErrorCodes.BAD_REQUEST],
        () =>
          http().post('/api/v1/auth/login').set('Content-Type', 'application/json').send('{"x":'),
      ],
      ['no token', 401, [ErrorCodes.UNAUTHORIZED], () => call('get', '/servers')],
      [
        'wrong password',
        401,
        [ErrorCodes.UNAUTHORIZED],
        () =>
          call('post', '/auth/login', undefined, {
            email: alice.email,
            password: 'wrong-password',
          }),
      ],
      [
        'not a member of the server',
        403,
        [ErrorCodes.FORBIDDEN],
        () => call('get', `/servers/${serverId}`, dan),
      ],
      [
        'missing permission',
        403,
        [ErrorCodes.FORBIDDEN],
        () => call('post', `/servers/${serverId}/channels`, carol, { name: 'x' }),
      ],
      [
        'unknown channel id',
        404,
        [ErrorCodes.NOT_FOUND],
        () => call('get', `/channels/${randomUUID()}/messages`, alice),
      ],
      ['unknown route', 404, [ErrorCodes.NOT_FOUND], () => call('get', '/no-such-route', alice)],
      [
        'already a member',
        409,
        [ErrorCodes.CONFLICT],
        () => call('post', '/servers/join', carol, { inviteCode }),
      ],
      [
        'body over the size limit',
        413,
        [ErrorCodes.BAD_REQUEST],
        () =>
          call('post', '/auth/login', undefined, {
            email: 'a@b.dev',
            password: 'x'.repeat(40_000),
          }),
      ],
    ];

    it.each(cases)('%s → %i', async (_name, status, codes, run) => {
      const res = await run();
      expect(res.status).toBe(status);
      expect(Object.keys(res.body).sort()).toEqual(
        expect.arrayContaining(['code', 'message', 'requestId']),
      );
      expect(codes).toContain(res.body.code);
      expect(isErrorCode(res.body.code)).toBe(true);
      expect(res.headers['x-request-id']).toBe(res.body.requestId);
      expect(res.body.stack).toBeUndefined();
      const allowed = ['code', 'message', 'requestId', 'details'];
      expect(Object.keys(res.body).filter((key) => !allowed.includes(key))).toEqual([]);
    });

    it('validation errors carry details [{ path, code, message }]', async () => {
      const res = await call('post', '/auth/login', undefined, { email: 'nope' });
      expect(Array.isArray(res.body.details)).toBe(true);
      expect(Object.keys(res.body.details[0]).sort()).toEqual(['code', 'message', 'path']);
    });

    it('429 carries TOO_MANY_REQUESTS and Retry-After', async () => {
      await redis.flushdb();
      const email = `ratelimit-${runId}@ping.dev`;
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await call('post', '/auth/login', undefined, { email, password: 'wrong-password' }).expect(
          401,
        );
      }
      const res = await call('post', '/auth/login', undefined, {
        email,
        password: 'wrong-password',
      });
      expect(res.status).toBe(429);
      expect(res.body.code).toBe(ErrorCodes.TOO_MANY_REQUESTS);
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    });

    it('503 carries SERVICE_UNAVAILABLE (dependency down)', async () => {
      const down = await bootApp({ deadRedis: true });
      try {
        const res = await request(down.getHttpServer())
          .post('/api/v1/auth/login')
          .send({ email: alice.email, password: 'password123' });
        expect(res.status).toBe(503);
        expect(res.body.code).toBe(ErrorCodes.SERVICE_UNAVAILABLE);
        expect(res.headers['x-request-id']).toBe(res.body.requestId);
      } finally {
        await down.close();
      }
    });
  });

  describe('data: camelCase keys, ISO 8601 UTC dates, uuid ids, bigint as string', () => {
    const samples: Array<[string, () => Promise<request.Response>]> = [
      ['GET /users/me', () => call('get', '/users/me', alice)],
      ['GET /servers', () => call('get', '/servers', alice)],
      ['GET /servers/:id', () => call('get', `/servers/${serverId}`, alice)],
      [
        'GET /servers/:id/me/permissions',
        () => call('get', `/servers/${serverId}/me/permissions`, alice),
      ],
      ['GET /servers/:id/members', () => call('get', `/servers/${serverId}/members`, alice)],
      ['GET /servers/:id/channels', () => call('get', `/servers/${serverId}/channels`, alice)],
      ['GET /servers/:id/roles', () => call('get', `/servers/${serverId}/roles`, alice)],
      ['GET /channels/:id/messages', () => call('get', `/channels/${channelId}/messages`, alice)],
      [
        'PUT /messages/:id/reactions/:emoji',
        () => call('put', `/messages/${messageId}/reactions/${encodeURIComponent('👍')}`, alice),
      ],
      [
        'GET /messages/:id/reactions/:emoji',
        () => call('get', `/messages/${messageId}/reactions/${encodeURIComponent('👍')}`, alice),
      ],
    ];

    function walk(value: unknown, path: string, problems: string[]): void {
      if (Array.isArray(value)) {
        value.forEach((item, index) => walk(item, `${path}[${index}]`, problems));
      } else if (value !== null && typeof value === 'object') {
        for (const [key, child] of Object.entries(value)) {
          const here = `${path}.${key}`;
          if (!CAMEL.test(key)) problems.push(`${here}: tên khóa không phải camelCase`);
          if (
            /(^|[a-z])At$/.test(key) &&
            child !== null &&
            !(typeof child === 'string' && ISO_UTC.test(child))
          ) {
            problems.push(`${here}: ngày không phải ISO 8601 UTC (${String(child)})`);
          }
          if (
            (key === 'id' || key.endsWith('Id')) &&
            child !== null &&
            !(typeof child === 'string' && UUID.test(child))
          ) {
            problems.push(`${here}: id không phải UUID`);
          }
          if (key === 'permissions' && !(typeof child === 'string' && /^\d+$/.test(child))) {
            problems.push(`${here}: permissions phải là chuỗi số thập phân`);
          }
          walk(child, here, problems);
        }
      }
    }

    it.each(samples)('%s', async (_name, run) => {
      const res = await run();
      expect(res.status).toBe(200);
      const problems: string[] = [];
      walk(res.body, '$', problems);
      expect(problems).toEqual([]);
    });
  });

  describe('HTTP status per operation', () => {
    it('reaction PUT and DELETE both answer 200 with the current summary', async () => {
      const url = `/messages/${messageId}/reactions/${encodeURIComponent('👍')}`;
      const added = await call('put', url, alice).expect(200);
      expect(added.body).toEqual({ messageId, reactions: [{ emoji: '👍', count: 1, me: true }] });
      const users = await call('get', `${url}?limit=1`, alice).expect(200);
      expect(Object.keys(users.body).sort()).toEqual(['hasMore', 'nextCursor', 'total', 'users']);
      expect(Object.keys(users.body.users[0]).sort()).toEqual([
        'avatarUrl',
        'displayName',
        'id',
        'username',
      ]);
      for (let retry = 0; retry < 2; retry += 1) {
        const removed = await call('delete', url, alice).expect(200);
        expect(removed.body).toEqual({ messageId, reactions: [] });
      }
    });

    it('create → 201; read and update → 200; relationship removal → 204; resource delete → 200 { id }', async () => {
      const server = await call('post', '/servers', dan, { name: `own-${runId}` });
      expect(server.status).toBe(201);
      const created = await call('post', `/servers/${server.body.id}/channels`, dan, {
        name: 'extra',
      });
      expect(created.status).toBe(201);
      expect(
        (await call('patch', `/channels/${created.body.id}`, dan, { name: 'renamed' })).status,
      ).toBe(200);
      const deleted = await call('delete', `/channels/${created.body.id}`, dan);
      expect(deleted.status).toBe(200);
      expect(deleted.body).toEqual({ id: created.body.id });

      const message = await call('post', `/channels/${channelId}/messages`, carol, {
        content: 'x',
        nonce: randomUUID(),
      });
      expect(message.status).toBe(201);
      expect(
        (await call('patch', `/messages/${message.body.id}`, carol, { content: 'y' })).status,
      ).toBe(200);
      expect((await call('delete', `/messages/${message.body.id}`, carol)).body).toEqual({
        id: message.body.id,
      });

      expect((await call('post', `/servers/${server.body.id}/leave`, carol)).status).toBe(403); // chưa là member
      expect((await call('delete', `/servers/${server.body.id}`, dan)).status).toBe(200);
      expect(
        (
          await call('post', '/auth/login', undefined, {
            email: dan.email,
            password: 'password123',
          })
        ).status,
      ).toBe(200);
    });

    it('leave and kick answer 204 without a body', async () => {
      const eve = await register('e');
      await call('post', '/servers/join', eve, { inviteCode }).expect(201);
      const left = await call('post', `/servers/${serverId}/leave`, eve);
      expect(left.status).toBe(204);
      expect(left.text).toBe('');
      await call('post', '/servers/join', eve, { inviteCode }).expect(201);
      const members = (await call('get', `/servers/${serverId}/members`, alice)).body;
      const eveMember = members.members.find((m: { userId: string }) => m.userId === eve.id);
      const kicked = await call('delete', `/servers/${serverId}/members/${eveMember.id}`, alice);
      expect(kicked.status).toBe(204);
      expect(kicked.text).toBe('');
    });
  });

  describe('403 or 404', () => {
    it('an unknown or foreign SERVER is always 403: the answer never reveals whether it exists', async () => {
      expect((await call('get', `/servers/${randomUUID()}`, dan)).status).toBe(403);
      expect((await call('get', `/servers/${serverId}`, dan)).status).toBe(403);
    });

    it('a channel, message or role id that exists nowhere is 404; one that exists but is not yours is 403', async () => {
      for (const url of [
        `/channels/${randomUUID()}/messages`,
        `/messages/${randomUUID()}`,
        `/roles/${randomUUID()}`,
      ]) {
        const verb = url.startsWith('/channels') ? 'get' : 'patch';
        expect((await call(verb, url, alice, { content: 'x', name: 'x' })).status, url).toBe(404);
      }
      expect((await call('get', `/channels/${channelId}/messages`, dan)).status).toBe(403);
      expect((await call('patch', `/messages/${messageId}`, dan, { content: 'x' })).status).toBe(
        403,
      );
      expect((await call('patch', `/roles/${roleId}`, dan, { name: 'x' })).status).toBe(403);
    });

    it('a member id that is not in the server is 404 for someone allowed to manage it', async () => {
      expect(
        (await call('delete', `/servers/${serverId}/members/${randomUUID()}`, alice)).status,
      ).toBe(404);
      expect(carolMemberId).toMatch(UUID);
    });
  });

  describe('pagination: cursor, never offset', () => {
    it('messages: { messages, hasMore }, `before` cursor, limit 1..100', async () => {
      for (let count = 0; count < 3; count += 1) {
        await call('post', `/channels/${channelId}/messages`, alice, {
          content: `p${count}`,
          nonce: randomUUID(),
        }).expect(201);
      }
      const first = await call('get', `/channels/${channelId}/messages?limit=2`, alice).expect(200);
      expect(Object.keys(first.body).sort()).toEqual(['hasMore', 'messages']);
      expect(first.body.messages).toHaveLength(2);
      expect(first.body.hasMore).toBe(true);
      const cursor = first.body.messages.at(-1).id;
      const second = await call(
        'get',
        `/channels/${channelId}/messages?limit=2&before=${cursor}`,
        alice,
      ).expect(200);
      expect(second.body.messages.every((m: { id: string }) => m.id < cursor)).toBe(true);
      for (const limit of [0, 101, 'abc']) {
        const bad = await call('get', `/channels/${channelId}/messages?limit=${limit}`, alice);
        expect(bad.status, `limit=${limit}`).toBe(400);
      }
      expect((await call('get', `/channels/${channelId}/messages?offset=5`, alice)).status).toBe(
        200,
      ); // offset không có tác dụng
    });

    it('members: { members, hasMore }, `after` cursor, limit 1..100', async () => {
      const first = await call('get', `/servers/${serverId}/members?limit=1`, alice).expect(200);
      expect(Object.keys(first.body).sort()).toEqual(['hasMore', 'members']);
      expect(first.body.members).toHaveLength(1);
      expect(first.body.hasMore).toBe(true);
      const second = await call(
        'get',
        `/servers/${serverId}/members?limit=1&after=${first.body.members[0].id}`,
        alice,
      ).expect(200);
      expect(second.body.members).toHaveLength(1);
      expect(second.body.members[0].id).not.toBe(first.body.members[0].id);
      for (const limit of [0, 101]) {
        expect(
          (await call('get', `/servers/${serverId}/members?limit=${limit}`, alice)).status,
        ).toBe(400);
      }
    });
  });
});
