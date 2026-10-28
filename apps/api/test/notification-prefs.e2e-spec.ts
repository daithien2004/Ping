import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { NotificationPrefDto, NotificationPrefsResponse } from '@ping/shared';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { RedisProvider } from '../src/infra/redis/redis.module.js';
import { bootApp } from './helpers/boot.js';

/**
 * TG.12: prefs thông báo (mức all/mentions/none + mute có hạn) theo server/channel —
 * server CHỈ lưu + đọc lại; badge/notification do client tính. Phủ: GET rỗng ban đầu,
 * PUT server + channel đúng shape, upsert không nhân dòng (unique 3 cột), DELETE idempotent
 * 204, 404 target lạ, 401 chưa đăng nhập, mutedUntil ISO có offset lưu/đọc trọn vẹn, và
 * cách ly giữa người dùng (IDOR: prefs là user-scoped, không vào bảng tấn công idor.e2e-spec
 * vì không có gì của người khác để đọc/sửa — xem ghi chú ID_ROUTES ở đó).
 */
describe('TG.12 notification prefs (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const emails: string[] = [];

  let aliceToken = '';
  let aliceId = '';
  let bobToken = '';
  let bobId = '';
  let serverId = '';
  let channelId = '';

  const http = () => request(app.getHttpServer());
  const auth = (call: request.Test, bearer: string) =>
    call.set('Authorization', `Bearer ${bearer}`);
  const BASE = '/api/v1/users/me/notification-prefs';

  async function register(label: string) {
    const email = `notif-${label}-${randomUUID().slice(0, 8)}@ping.dev`;
    emails.push(email);
    const res = await http()
      .post('/api/v1/auth/register')
      .send({
        email,
        username: `notif${label}${randomUUID().slice(0, 8)}`.slice(0, 32),
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

    const server = await auth(http().post('/api/v1/servers'), aliceToken)
      .send({ name: 'Notif Prefs' })
      .expect(201);
    serverId = server.body.id as string;
    channelId = server.body.channels[0].id as string;
  });

  afterAll(async () => {
    if (!app) return;
    // Prefs cascade theo user; server cascade channel. Không có tin nhắn nào trong spec này.
    await prisma.server.deleteMany({ where: { id: serverId } });
    await prisma.user.deleteMany({ where: { id: { in: [aliceId, bobId].filter(Boolean) } } });
    await app.close();
  });

  it('(a) GET ban đầu → prefs rỗng', async () => {
    const res = await auth(http().get(BASE), aliceToken).expect(200);
    expect(res.body).toEqual({ prefs: [] });
  });

  it('(b) PUT server + channel → 200 với đúng dòng; GET đủ 2 dòng đúng shape', async () => {
    const serverPref = await auth(http().put(`${BASE}/server/${serverId}`), aliceToken)
      .send({ level: 'mentions', mutedUntil: null })
      .expect(200);
    expect(serverPref.body).toEqual({
      scope: 'server',
      targetId: serverId,
      level: 'mentions',
      mutedUntil: null,
    });

    const channelPref = await auth(http().put(`${BASE}/channel/${channelId}`), aliceToken)
      .send({ level: 'none', mutedUntil: null })
      .expect(200);
    expect(channelPref.body).toEqual({
      scope: 'channel',
      targetId: channelId,
      level: 'none',
      mutedUntil: null,
    });

    const list = await auth(http().get(BASE), aliceToken).expect(200);
    const prefs = list.body.prefs as NotificationPrefDto[];
    expect(prefs).toHaveLength(2);
    expect(prefs).toEqual(
      expect.arrayContaining([
        { scope: 'server', targetId: serverId, level: 'mentions', mutedUntil: null },
        { scope: 'channel', targetId: channelId, level: 'none', mutedUntil: null },
      ]),
    );
  });

  it('(g) mutedUntil ISO có offset lưu/đọc trọn vẹn (chuẩn hóa UTC đúng mốc)', async () => {
    // +07:00 8:15 = 01:15 UTC — cùng thời điểm, cách trình bày khác nhau.
    const muted = '2026-11-15T08:15:00+07:00';
    await auth(http().put(`${BASE}/channel/${channelId}`), aliceToken)
      .send({ level: 'all', mutedUntil: muted })
      .expect(200);

    const list = await auth(http().get(BASE), aliceToken).expect(200);
    const row = (list.body.prefs as NotificationPrefDto[]).find((item) => item.scope === 'channel');
    expect(row?.mutedUntil).toBe('2026-11-15T01:15:00.000Z');

    // DB lưu đúng mốc thời gian (nguồn sự thật, không chỉ là map qua DTO).
    const stored = await prisma.notificationPref.findUniqueOrThrow({
      where: { userId_scope_targetId: { userId: aliceId, scope: 'channel', targetId: channelId } },
      select: { mutedUntil: true, level: true },
    });
    expect(stored.mutedUntil?.toISOString()).toBe('2026-11-15T01:15:00.000Z');
    expect(stored.level).toBe('all');
  });

  it('(c) PUT lần 2 cùng target → upsert: không nhân dòng, giá trị mới thay cũ', async () => {
    await auth(http().put(`${BASE}/server/${serverId}`), aliceToken)
      .send({ level: 'none', mutedUntil: null })
      .expect(200);

    const list = await auth(http().get(BASE), aliceToken).expect(200);
    const prefs = list.body.prefs as NotificationPrefDto[];
    // Vẫn đúng 2 dòng (1 server + 1 channel) — PUT lại không tạo thêm.
    expect(prefs).toHaveLength(2);
    expect(prefs.find((item) => item.scope === 'server')?.level).toBe('none');

    const rows = await prisma.notificationPref.findMany({ where: { userId: aliceId } });
    expect(rows).toHaveLength(2); // chốt bằng DB, không chỉ qua DTO
  });

  it('(e) target không tồn tại → 404 cả server lẫn channel (prefs không ghi)', async () => {
    const ghost = randomUUID();
    await auth(http().put(`${BASE}/server/${ghost}`), aliceToken)
      .send({ level: 'all', mutedUntil: null })
      .expect(404);
    await auth(http().put(`${BASE}/channel/${ghost}`), aliceToken)
      .send({ level: 'all', mutedUntil: null })
      .expect(404);
    expect(await prisma.notificationPref.count({ where: { userId: aliceId } })).toBe(2);
  });

  it('(f) unauthenticated → 401 mọi method của route prefs', async () => {
    await http().get(BASE).expect(401);
    await http().put(`${BASE}/server/${serverId}`).send({}).expect(401);
    await http().put(`${BASE}/channel/${channelId}`).send({}).expect(401);
    await http().delete(`${BASE}/server/${serverId}`).expect(401);
    await http().delete(`${BASE}/channel/${channelId}`).expect(401);
  });

  it('(d) DELETE → GET rỗng; DELETE lần 2 vẫn 204 (idempotent)', async () => {
    await auth(http().delete(`${BASE}/server/${serverId}`), aliceToken).expect(204);
    await auth(http().delete(`${BASE}/channel/${channelId}`), aliceToken).expect(204);

    const list = await auth(http().get(BASE), aliceToken).expect(200);
    expect(list.body).toEqual({ prefs: [] });

    // Hàng đã mất: deleteMany count 0 — vẫn 204 (reset về mặc định là idempotent).
    await auth(http().delete(`${BASE}/server/${serverId}`), aliceToken).expect(204);
    await auth(http().delete(`${BASE}/channel/${channelId}`), aliceToken).expect(204);
    expect(await prisma.notificationPref.count({ where: { userId: aliceId } })).toBe(0);
  });

  it('cách ly giữa người dùng: bob không thấy, không sửa, không xóa được prefs của alice (IDOR)', async () => {
    // Alice cấu hình lại server pref của mình.
    await auth(http().put(`${BASE}/server/${serverId}`), aliceToken)
      .send({ level: 'mentions', mutedUntil: null })
      .expect(200);

    // Bob GET → chỉ prefs của chính bob (rỗng), không lộ dòng của alice.
    const bobList = await auth(http().get(BASE), bobToken).expect(200);
    expect(bobList.body).toEqual({ prefs: [] });

    // Bob DELETE cùng target → 204 nhưng chỉ đụng hàng của BOB (không có).
    await auth(http().delete(`${BASE}/server/${serverId}`), bobToken).expect(204);

    // Dòng của alice còn nguyên; DB chỉ có đúng 1 hàng server-prefs của alice.
    const aliceList = await auth(http().get(BASE), aliceToken).expect(200);
    expect(
      (aliceList.body as NotificationPrefsResponse).prefs.find((item) => item.scope === 'server')
        ?.level,
    ).toBe('mentions');
    const rows = await prisma.notificationPref.findMany({
      where: { scope: 'server', targetId: serverId },
      select: { userId: true },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.userId).toBe(aliceId);
  });

  it('body sai schema (level lạ) → 400 VALIDATION_ERROR, không đụng DB', async () => {
    const res = await auth(http().put(`${BASE}/server/${serverId}`), aliceToken)
      .send({ level: 'sometimes', mutedUntil: null })
      .expect(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(await prisma.notificationPref.count({ where: { userId: aliceId } })).toBe(1);
  });
});
