import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { BlockedUserDto, UserSettingsDto } from '@ping/shared';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { RedisProvider } from '../src/infra/redis/redis.module.js';
import { bootApp } from './helpers/boot.js';

describe('TG.13 user settings + blocks (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const emails: string[] = [];

  let aliceToken = '';
  let aliceId = '';
  let bobToken = '';
  let bobId = '';
  let carolId = '';

  const http = () => request(app.getHttpServer());
  const auth = (call: request.Test, bearer: string) =>
    call.set('Authorization', `Bearer ${bearer}`);
  const SETTINGS = '/api/v1/users/me/settings';
  const BLOCKS = '/api/v1/users/me/blocks';
  const DEFAULT_SETTINGS: UserSettingsDto = {
    theme: 'system',
    density: 'comfortable',
    fontSize: 'md',
    locale: 'vi',
  };

  async function register(label: string) {
    const email = `settings-${label}-${randomUUID().slice(0, 8)}@ping.dev`;
    emails.push(email);
    const res = await http()
      .post('/api/v1/auth/register')
      .send({
        email,
        username: `set${label}${randomUUID().slice(0, 8)}`.slice(0, 32),
        password: 'password123',
      })
      .expect(201);
    return { id: res.body.user.id as string, token: res.body.accessToken as string };
  }

  beforeAll(async () => {
    app = await bootApp();
    prisma = app.get(PrismaService);
    await app.get(RedisProvider).flushdb();

    const alice = await register('a');
    aliceId = alice.id;
    aliceToken = alice.token;
    const bob = await register('b');
    bobId = bob.id;
    bobToken = bob.token;
    const carol = await register('c');
    carolId = carol.id;
  });

  afterAll(async () => {
    if (!app) return;
    await prisma.user.deleteMany({
      where: { id: { in: [aliceId, bobId, carolId].filter(Boolean) } },
    });
    await app.close();
  });

  it('(a) GET ban đầu → DTO mặc định và KHÔNG tạo hàng trong DB (lazy)', async () => {
    const res = await auth(http().get(SETTINGS), aliceToken).expect(200);
    expect(res.body).toEqual(DEFAULT_SETTINGS);
    expect(await prisma.userSettings.count({ where: { userId: aliceId } })).toBe(0);
  });

  it('(b) PATCH theme → GET khớp, các trường khác giữ mặc định', async () => {
    const patched = await auth(http().patch(SETTINGS), aliceToken)
      .send({ theme: 'dark' })
      .expect(200);
    expect(patched.body).toEqual({ ...DEFAULT_SETTINGS, theme: 'dark' });

    const fetched = await auth(http().get(SETTINGS), aliceToken).expect(200);
    expect(fetched.body).toEqual({ ...DEFAULT_SETTINGS, theme: 'dark' });

    const rows = await prisma.userSettings.findMany({ where: { userId: aliceId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      theme: 'dark',
      density: 'comfortable',
      fontSize: 'md',
      locale: 'vi',
    });
  });

  it('(c) PATCH 2 trường (density + locale) → giữ trường đã PATCH trước đó', async () => {
    const patched = await auth(http().patch(SETTINGS), aliceToken)
      .send({ density: 'compact', locale: 'en' })
      .expect(200);
    expect(patched.body).toEqual({
      theme: 'dark',
      density: 'compact',
      fontSize: 'md',
      locale: 'en',
    });

    const rows = await prisma.userSettings.findMany({ where: { userId: aliceId } });
    expect(rows).toHaveLength(1);
  });

  it('(d) body rỗng / field lạ → 400 VALIDATION_ERROR, không tạo hàng', async () => {
    const empty = await auth(http().patch(SETTINGS), aliceToken).send({}).expect(400);
    expect(empty.body.code).toBe('VALIDATION_ERROR');
    const unknown = await auth(http().patch(SETTINGS), aliceToken).send({ foo: 'bar' }).expect(400);
    expect(unknown.body.code).toBe('VALIDATION_ERROR');
    expect(await prisma.userSettings.count({ where: { userId: aliceId } })).toBe(1);
  });

  it("(e) locale 'jp' không thuộc SETTINGS_LOCALES → 400, DB không đổi", async () => {
    const res = await auth(http().patch(SETTINGS), aliceToken).send({ locale: 'jp' }).expect(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    const row = await prisma.userSettings.findUniqueOrThrow({ where: { userId: aliceId } });
    expect(row.locale).toBe('en');
  });

  it('(f) privacy: GET đọc giá trị đã lưu (TG.13) — mặc định rồi theo PATCH của TG.9', async () => {
    const initial = await auth(http().get('/api/v1/users/me/privacy'), aliceToken).expect(200);
    expect(initial.body).toEqual({ dmAllow: 'server_members' });

    await auth(http().patch('/api/v1/users/me/privacy'), aliceToken)
      .send({ dmAllow: 'none' })
      .expect(200);

    const after = await auth(http().get('/api/v1/users/me/privacy'), aliceToken).expect(200);
    expect(after.body).toEqual({ dmAllow: 'none' });
    const bob = await auth(http().get('/api/v1/users/me/privacy'), bobToken).expect(200);
    expect(bob.body).toEqual({ dmAllow: 'server_members' });

    await auth(http().patch('/api/v1/users/me/privacy'), aliceToken)
      .send({ dmAllow: 'server_members' })
      .expect(200);
  });

  it('(g) blocks: rỗng ban đầu → block 2 người (mới nhất trước) → unblock dần về rỗng', async () => {
    const initial = await auth(http().get(BLOCKS), aliceToken).expect(200);
    expect(initial.body).toEqual({ blocked: [] });

    await auth(http().post(`/api/v1/users/${carolId}/block`), aliceToken).expect(204);
    await auth(http().post(`/api/v1/users/${bobId}/block`), aliceToken).expect(204);

    const afterBlock = await auth(http().get(BLOCKS), aliceToken).expect(200);
    const blocked = afterBlock.body.blocked as BlockedUserDto[];
    expect(blocked).toHaveLength(2);
    expect(blocked.map((row) => row.userId)).toEqual([bobId, carolId]);
    for (const row of blocked) {
      expect(Object.keys(row).sort()).toEqual([
        'avatarUrl',
        'blockedAt',
        'displayName',
        'userId',
        'username',
      ]);
      expect(new Date(row.blockedAt).getTime()).toBeGreaterThan(0);
    }
    expect(blocked[0]).toMatchObject({ userId: bobId });
    expect(blocked[1]).toMatchObject({ userId: carolId });

    await auth(http().delete(`/api/v1/users/${bobId}/block`), aliceToken).expect(204);
    const afterOne = await auth(http().get(BLOCKS), aliceToken).expect(200);
    expect((afterOne.body.blocked as BlockedUserDto[]).map((row) => row.userId)).toEqual([carolId]);

    await auth(http().delete(`/api/v1/users/${carolId}/block`), aliceToken).expect(204);
    const final = await auth(http().get(BLOCKS), aliceToken).expect(200);
    expect(final.body).toEqual({ blocked: [] });
    expect(await prisma.userBlock.count({ where: { blockerId: aliceId } })).toBe(0);
  });

  it('(h) unauthenticated → 401 cả GET/PATCH settings, GET blocks và GET privacy', async () => {
    await http().get(SETTINGS).expect(401);
    await http().patch(SETTINGS).send({ theme: 'dark' }).expect(401);
    await http().get(BLOCKS).expect(401);
    await http().get('/api/v1/users/me/privacy').expect(401);
  });

  it('cách ly giữa người dùng: bob chỉ thấy/cài được settings và blocks của chính bob', async () => {
    const bobSettings = await auth(http().get(SETTINGS), bobToken).expect(200);
    expect(bobSettings.body).toEqual(DEFAULT_SETTINGS);

    await auth(http().patch(SETTINGS), bobToken).send({ fontSize: 'sm' }).expect(200);
    await auth(http().post(`/api/v1/users/${carolId}/block`), bobToken).expect(204);

    const aliceRow = await prisma.userSettings.findUniqueOrThrow({ where: { userId: aliceId } });
    expect(aliceRow).toMatchObject({ fontSize: 'md', theme: 'dark' });
    const bobBlocks = await auth(http().get(BLOCKS), bobToken).expect(200);
    expect((bobBlocks.body.blocked as BlockedUserDto[]).map((row) => row.userId)).toEqual([
      carolId,
    ]);
    const aliceBlocks = await auth(http().get(BLOCKS), aliceToken).expect(200);
    expect(aliceBlocks.body).toEqual({ blocked: [] });

    await auth(http().delete(`/api/v1/users/${carolId}/block`), bobToken).expect(204);
  });
});
