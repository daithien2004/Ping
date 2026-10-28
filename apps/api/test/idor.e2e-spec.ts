import { RequestMethod, type INestApplication } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { ModulesContainer } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { RedisProvider } from '../src/infra/redis/redis.module.js';
import { bootApp } from './helpers/boot.js';

/**
 * Bộ test IDOR (hướng dẫn 16.5, quy tắc 16): mọi endpoint nhận ID phải từ chối người không có
 * quyền DÙ ID ĐÚNG. 19 endpoint x các kiểu kẻ tấn công:
 *  - outsider: user không thuộc server nào;
 *  - rival: chủ của một server KHÁC (dùng ID của server A, hoặc trộn ID chéo server);
 *  - member: thành viên thường của server A (chỉ có @everyone), gọi thao tác cần quyền cao hơn.
 * Mỗi lần tấn công kiểm ba điều: status 403/404, body không lộ dữ liệu của server A, và DB không đổi.
 */
const runId = Date.now().toString(36);

type Verb = 'get' | 'post' | 'patch' | 'put' | 'delete';

/** Mọi endpoint nhận ID (path đã chuẩn hóa: `:id` thay cho `:serverId`, `:channelId`…). Nguồn của test 401 và test phủ route. */
const ID_ROUTES: Array<[Verb, string]> = [
  ['get', '/servers/:id'],
  ['patch', '/servers/:id'],
  ['get', '/servers/:id/me/permissions'],
  ['get', '/servers/:id/members'],
  ['patch', '/servers/:id/members/me'],
  ['post', '/servers/:id/leave'],
  ['delete', '/servers/:id/members/:id'],
  ['delete', '/servers/:id'],
  ['get', '/servers/:id/channels'],
  ['post', '/servers/:id/channels'],
  ['patch', '/channels/:id'],
  ['delete', '/channels/:id'],
  ['get', '/servers/:id/roles'],
  ['post', '/servers/:id/roles'],
  ['get', '/servers/:id/audit-log'],
  ['put', '/servers/:id/members/:id/roles'],
  ['patch', '/roles/:id'],
  ['delete', '/roles/:id'],
  ['post', '/servers/:id/invite/regenerate'],
  ['get', '/servers/:id/search'],
  ['get', '/channels/:id/messages'],
  ['post', '/channels/:id/messages'],
  ['put', '/channels/:id/read'],
  ['get', '/servers/:id/unread'],
  ['patch', '/messages/:id'],
  ['delete', '/messages/:id'],
  ['get', '/messages/:id/reactions/:emoji'],
  ['put', '/messages/:id/reactions/:emoji'],
  ['delete', '/messages/:id/reactions/:emoji'],
  ['get', '/channels/:id/pins'],
  ['put', '/messages/:id/pin'],
  ['delete', '/messages/:id/pin'],
  ['post', '/servers/:id/ask'],
  ['put', '/uploads/:id/content'],
  ['post', '/uploads/:id/complete'],
  ['get', '/uploads/:id'],
  ['delete', '/uploads/:id'],
  ['get', '/attachments/:id/download'],
  ['get', '/attachments/:id/file'],
  // TG.22: sticker — tạo/xem theo server, xóa theo chính sticker.
  ['post', '/servers/:id/stickers'],
  ['get', '/servers/:id/stickers'],
  ['delete', '/stickers/:id'],
  // TG.24: emoji tùy chỉnh — tạo/xem theo server, xóa theo chính emoji.
  ['post', '/servers/:id/emojis'],
  ['get', '/servers/:id/emojis'],
  ['delete', '/emojis/:id'],
  // TG.9 (ADR-0070): block/unblock user — bối cảnh là CHÍNH người gọi, quyền do service kiểm
  // (không có ability server). POST/GET /dms KHÔNG nằm ở đây: route không có id trong path
  // nên test phủ route (chỉ quét route `:id`) không bắt — IDOR của DM phủ ở test/dms.e2e-spec.ts
  // (người thứ ba → 404 mọi route /channels/:id/*, không join được room).
  ['post', '/users/:id/block'],
  ['delete', '/users/:id/block'],
  // TG.12: prefs thông báo theo server/channel — PUT/DELETE có id target trên path. Dữ liệu
  // user-scoped (userId từ JWT, không bao giờ từ path; không kiểm quyền member vì đặt prefs
  // cho target mình không thuộc là vô hại — lý do ở NotificationsService). Không có gì của
  // người khác để đọc/sửa nên không vào bảng tấn công: cách ly giữa người dùng phủ ở
  // test/notification-prefs.e2e-spec.ts (user khác GET/DELETE không đụng được dòng của nhau).
  ['put', '/users/me/notification-prefs/server/:id'],
  ['put', '/users/me/notification-prefs/channel/:id'],
  ['delete', '/users/me/notification-prefs/server/:id'],
  ['delete', '/users/me/notification-prefs/channel/:id'],
];

/** Quét controller của app qua metadata của Nest: các route có tham số `:...Id`, dạng `verb /path/:id`, đã sắp xếp. */
function discoverIdRoutes(app: INestApplication): string[] {
  const found: string[] = [];
  for (const module of app.get(ModulesContainer).values()) {
    for (const wrapper of module.controllers.values()) {
      const controller = wrapper.metatype as (new (...args: never[]) => object) | null;
      if (!controller) continue;
      const base = Reflect.getMetadata(PATH_METADATA, controller) as string | string[] | undefined;
      for (const name of Object.getOwnPropertyNames(controller.prototype)) {
        const handler = (controller.prototype as Record<string, unknown>)[name];
        if (typeof handler !== 'function') continue;
        const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
        if (method === undefined) continue;
        const path = Reflect.getMetadata(PATH_METADATA, handler) as string | string[] | undefined;
        // `@Get()` không tham số cho path mặc định `'/'`: gộp lại và bỏ dấu `/` cuối để
        // `/servers/:id/audit-log/` và `/servers/:id/audit-log` là một route.
        const full = `/${[base, path].flat().filter(Boolean).join('/')}`
          .replace(/\/+/g, '/')
          .replace(/\/$/, '');
        const normalized = full.replace(/:[A-Za-z]*Id/g, ':id');
        if (normalized.includes(':id')) {
          found.push(`${RequestMethod[method]!.toLowerCase()} ${normalized}`);
        }
      }
    }
  }
  return found.sort();
}

interface Actor {
  id: string;
  token: string;
  email: string;
}

describe('IDOR (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const emails: string[] = [];

  let alice: Actor; // chủ server A
  let carol: Actor; // thành viên thường của A
  let bob: Actor; // chủ server B (đối thủ)
  let dan: Actor; // người ngoài
  let serverA = '';
  let serverB = '';
  let channelA = '';
  let roleA = '';
  let aliceMemberA = '';
  let carolMemberA = '';
  let bobMemberB = '';
  let aliceMessage = '';
  let carolMessage = '';
  let uploadId = '';
  let stickerA = ''; // sticker của server A (TG.22) cho bảng tấn công
  let stickerPackA = '';
  let emojiA = ''; // emoji của server A (TG.24) cho bảng tấn công

  const SECRET = `secret-${runId}`; // xuất hiện trong dữ liệu của server A; không được rò ra
  const http = () => request(app.getHttpServer());

  async function register(label: string): Promise<Actor> {
    const email = `idor-${label}-${runId}@ping.dev`;
    emails.push(email);
    const res = await http()
      .post('/api/v1/auth/register')
      .send({ email, username: `i${label}${runId}`.slice(0, 32), password: 'password123' })
      .expect(201);
    return { id: res.body.user.id, token: res.body.accessToken, email };
  }
  const as = (
    actor: Actor | undefined,
    method: 'get' | 'post' | 'patch' | 'put' | 'delete',
    url: string,
  ) => {
    const call = http()[method](`/api/v1${url}`);
    return actor ? call.set('Authorization', `Bearer ${actor.token}`) : call;
  };

  /** Ảnh chụp DB phần thuộc server A: nếu cuộc tấn công làm đổi gì thì so sánh sẽ lệch. */
  async function snapshotA() {
    const [server, members, roles, channels, messages, memberRoles, carolSessions, emojis] =
      await Promise.all([
        prisma.server.findUnique({ where: { id: serverA } }),
        prisma.member.findMany({ where: { serverId: serverA }, orderBy: { id: 'asc' } }),
        prisma.role.findMany({ where: { serverId: serverA }, orderBy: { id: 'asc' } }),
        prisma.channel.findMany({ where: { serverId: serverA }, orderBy: { id: 'asc' } }),
        prisma.message.findMany({
          where: { channel: { serverId: serverA } },
          orderBy: { id: 'asc' },
        }),
        prisma.memberRole.findMany({
          where: { member: { serverId: serverA } },
          orderBy: [{ memberId: 'asc' }, { roleId: 'asc' }],
        }),
        prisma.member.count({ where: { userId: bob.id } }),
        prisma.customEmoji.findMany({ where: { serverId: serverA }, orderBy: { id: 'asc' } }),
      ]);
    return JSON.parse(
      JSON.stringify(
        { server, members, roles, channels, messages, memberRoles, carolSessions, emojis },
        (_k, v) => (typeof v === 'bigint' ? v.toString() : v),
      ),
    );
  }

  beforeAll(async () => {
    app = await bootApp();
    prisma = app.get(PrismaService);
    await app.get(RedisProvider).flushdb(); // reset rate limit giữa các lần chạy (Redis DB riêng của e2e)
    [alice, carol, bob, dan] = await Promise.all([
      register('a'),
      register('c'),
      register('b'),
      register('d'),
    ]);

    const a = await as(alice, 'post', '/servers').send({ name: SECRET }).expect(201);
    serverA = a.body.id;
    channelA = a.body.channels[0].id;
    roleA = (
      await as(alice, 'post', `/servers/${serverA}/roles`)
        .send({ name: `role-${SECRET}`, permissions: '2' })
        .expect(201)
    ).body.id;
    await as(carol, 'post', '/servers/join').send({ inviteCode: a.body.inviteCode }).expect(201);

    const b = await as(bob, 'post', '/servers')
      .send({ name: `other-${runId}` })
      .expect(201);
    serverB = b.body.id;

    const membersA = (await as(alice, 'get', `/servers/${serverA}/members`).expect(200)).body
      .members as Array<{ id: string; userId: string }>;
    aliceMemberA = membersA.find((m) => m.userId === alice.id)!.id;
    carolMemberA = membersA.find((m) => m.userId === carol.id)!.id;
    const membersB = (await as(bob, 'get', `/servers/${serverB}/members`).expect(200)).body
      .members as Array<{ id: string; userId: string }>;
    bobMemberB = membersB.find((m) => m.userId === bob.id)!.id;

    aliceMessage = (
      await as(alice, 'post', `/channels/${channelA}/messages`)
        .send({ content: `alice ${SECRET}`, nonce: randomUUID() })
        .expect(201)
    ).body.id;
    carolMessage = (
      await as(carol, 'post', `/channels/${channelA}/messages`)
        .send({ content: `carol ${SECRET}`, nonce: randomUUID() })
        .expect(201)
    ).body.id;
    uploadId = (
      await as(alice, 'post', '/uploads')
        .send({ channelId: channelA, filename: 'a.pdf', sizeBytes: 10, nonce: randomUUID() })
        .expect(201)
    ).body.id;

    // TG.22: một sticker của server A cho bảng tấn công — chèn thẳng DB để không cần
    // pipeline upload; rawRemoved sẵn + server tồn tại để worker quét không đụng hàng này.
    const packA = await prisma.stickerPack.create({
      data: { serverId: serverA, name: `pack-${runId}` },
    });
    stickerPackA = packA.id;
    const attA = await prisma.attachment.create({
      data: {
        uploaderId: alice.id,
        nonce: randomUUID(),
        filename: 'sticker.webp',
        sizeBytes: 64,
        quotaBytes: 64,
        scope: 'sticker',
        serverId: serverA,
        status: 'ready',
        boundAt: new Date(),
        rawRemoved: true,
        mime: 'image/webp',
        width: 8,
        height: 8,
      },
    });
    stickerA = (
      await prisma.sticker.create({
        data: {
          packId: packA.id,
          name: 'idor-sticker',
          tags: [],
          attachmentId: attA.id,
          createdBy: alice.id,
        },
      })
    ).id;

    // TG.24: một emoji của server A cho bảng tấn công — chèn thẳng DB như sticker trên.
    const emojiAttA = await prisma.attachment.create({
      data: {
        uploaderId: alice.id,
        nonce: randomUUID(),
        filename: 'emoji.webp',
        sizeBytes: 64,
        quotaBytes: 64,
        scope: 'customEmoji',
        serverId: serverA,
        status: 'ready',
        boundAt: new Date(),
        rawRemoved: true,
        mime: 'image/webp',
        width: 8,
        height: 8,
      },
    });
    emojiA = (
      await prisma.customEmoji.create({
        data: {
          serverId: serverA,
          name: 'idoremoji',
          animated: false,
          attachmentId: emojiAttA.id,
          createdBy: alice.id,
        },
      })
    ).id;
  });

  afterAll(async () => {
    // TG.22: sticker khóa attachment (Restrict) — dọn sticker + gói trước attachment.
    if (stickerPackA) {
      await prisma.sticker.deleteMany({ where: { packId: stickerPackA } });
      await prisma.stickerPack.deleteMany({ where: { id: stickerPackA } });
    }
    // TG.24: emoji cũng khóa attachment (Restrict) — xóa emoji trước attachment.
    if (serverA) await prisma.customEmoji.deleteMany({ where: { serverId: serverA } });
    await prisma.attachment.deleteMany({ where: { serverId: serverA } });
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

  interface Attack {
    name: string;
    by: () => Actor;
    verb: Verb;
    url: () => string;
    body?: () => unknown;
    /** Status chấp nhận là "bị từ chối". Mặc định 403/404; 400 chỉ cho ca ID chéo bị validate. */
    accept: number[];
  }

  /** Các lần tấn công vào tài nguyên server A. Chạy theo bảng để thêm endpoint thì thêm một dòng. */
  const attacks = (): Attack[] => {
    const out: Attack[] = [];
    const add = (
      name: string,
      verb: Verb,
      url: () => string,
      who: Array<() => Actor>,
      body?: () => unknown,
      accept: number[] = [403, 404],
    ) => who.forEach((by) => out.push({ name, by, verb, url, body, accept }));
    const outsider = [() => dan, () => bob]; // người ngoài + chủ server khác
    for (const [verb, suffix] of [
      ['get', ''],
      ['delete', ''],
      ['post', '/complete'],
      ['put', '/content'],
    ] as const) {
      add(`${verb} upload A`, verb, () => `/uploads/${uploadId}${suffix}`, [
        ...outsider,
        () => carol,
      ]);
    }
    add('attachment download A', 'get', () => `/attachments/${uploadId}/download`, outsider);
    add(
      'signed attachment with forged signature',
      'get',
      () =>
        `/attachments/${uploadId}/file?user=${alice.id}&expires=${Math.floor(Date.now() / 1000) + 30}&signature=${'0'.repeat(64)}`,
      outsider,
    );
    add(
      'create upload in another server',
      'post',
      () => '/uploads',
      outsider,
      () => ({ channelId: channelA, filename: 'secret.pdf', sizeBytes: 10, nonce: randomUUID() }),
    );
    const lowPriv = [() => dan, () => bob, () => carol]; // + thành viên thiếu quyền

    add('GET /servers/:serverId', 'get', () => `/servers/${serverA}`, outsider);
    add(
      'GET /servers/:serverId/me/permissions',
      'get',
      () => `/servers/${serverA}/me/permissions`,
      outsider,
    );
    add('GET /servers/:serverId/members', 'get', () => `/servers/${serverA}/members`, outsider);
    add(
      'PATCH /servers/:serverId/members/me',
      'patch',
      () => `/servers/${serverA}/members/me`,
      outsider,
    );
    add('POST /servers/:serverId/leave', 'post', () => `/servers/${serverA}/leave`, outsider);
    add(
      'DELETE /servers/:serverId/members/:memberId',
      'delete',
      () => `/servers/${serverA}/members/${aliceMemberA}`,
      lowPriv,
    );
    add('DELETE /servers/:serverId', 'delete', () => `/servers/${serverA}`, lowPriv);
    add('GET /servers/:serverId/channels', 'get', () => `/servers/${serverA}/channels`, outsider);
    add(
      'POST /servers/:serverId/channels',
      'post',
      () => `/servers/${serverA}/channels`,
      lowPriv,
      () => ({ name: `x-${SECRET}` }),
    );
    add(
      'PATCH /channels/:channelId',
      'patch',
      () => `/channels/${channelA}`,
      lowPriv,
      () => ({ name: 'hacked' }),
    );
    add('DELETE /channels/:channelId', 'delete', () => `/channels/${channelA}`, lowPriv);
    add('GET /servers/:serverId/roles', 'get', () => `/servers/${serverA}/roles`, lowPriv);
    add(
      'POST /servers/:serverId/roles',
      'post',
      () => `/servers/${serverA}/roles`,
      lowPriv,
      () => ({ name: 'evil', permissions: '64' }),
    );
    add(
      'PUT /servers/:serverId/members/:memberId/roles',
      'put',
      () => `/servers/${serverA}/members/${carolMemberA}/roles`,
      lowPriv,
      () => ({ roleIds: [roleA] }),
    );
    add(
      'PATCH /roles/:roleId',
      'patch',
      () => `/roles/${roleA}`,
      lowPriv,
      () => ({ permissions: '64' }),
    );
    add('DELETE /roles/:roleId', 'delete', () => `/roles/${roleA}`, lowPriv);
    add(
      'POST /servers/:serverId/invite/regenerate',
      'post',
      () => `/servers/${serverA}/invite/regenerate`,
      lowPriv,
      () => ({}),
    );
    add(
      'GET /channels/:channelId/messages',
      'get',
      () => `/channels/${channelA}/messages`,
      outsider,
    );
    // TG.5: permalink đọc quanh một tin — người ngoài không được dùng `around` để dò id.
    add(
      'GET /channels/:channelId/messages?around=<tin của A>',
      'get',
      () => `/channels/${channelA}/messages?around=${aliceMessage}`,
      outsider,
    );
    add(
      'POST /channels/:channelId/messages',
      'post',
      () => `/channels/${channelA}/messages`,
      outsider,
      () => ({ content: 'intruder', nonce: randomUUID() }),
    );
    add(
      'PUT /channels/:channelId/read',
      'put',
      () => `/channels/${channelA}/read`,
      outsider,
      () => ({ messageId: randomUUID() }),
    );
    add('GET /servers/:serverId/unread', 'get', () => `/servers/${serverA}/unread`, outsider);
    add(
      'GET /servers/:serverId/search',
      'get',
      () => `/servers/${serverA}/search?q=${SECRET}`,
      outsider,
    );
    add(
      'PATCH /messages/:messageId (của người khác)',
      'patch',
      () => `/messages/${aliceMessage}`,
      [...outsider, () => carol],
      () => ({ content: 'hacked' }),
    );
    add(
      'DELETE /messages/:messageId (của người khác)',
      'delete',
      () => `/messages/${aliceMessage}`,
      [...outsider, () => carol],
    );
    add(
      'PATCH /messages/:messageId (tin của carol, người ngoài)',
      'patch',
      () => `/messages/${carolMessage}`,
      outsider,
      () => ({ content: 'hacked' }),
    );
    add(
      'DELETE /messages/:messageId (tin của carol, người ngoài)',
      'delete',
      () => `/messages/${carolMessage}`,
      outsider,
    );
    // TG.2: người ngoài không đọc/ghi được cảm xúc của tin thuộc server A.
    add(
      'GET /messages/:messageId/reactions/:emoji (tin của A)',
      'get',
      () => `/messages/${aliceMessage}/reactions/${encodeURIComponent('👍')}`,
      outsider,
    );
    add(
      'PUT /messages/:messageId/reactions/:emoji (tin của A)',
      'put',
      () => `/messages/${aliceMessage}/reactions/${encodeURIComponent('👍')}`,
      outsider,
    );
    add(
      'DELETE /messages/:messageId/reactions/:emoji (tin của A)',
      'delete',
      () => `/messages/${aliceMessage}/reactions/${encodeURIComponent('👍')}`,
      outsider,
    );
    // TG.3: danh sách ghim đọc theo channel của A; ghim/bỏ ghim cần MANAGE_MESSAGES.
    add(
      'GET /channels/:channelId/pins (channel của A)',
      'get',
      () => `/channels/${channelA}/pins`,
      outsider,
    );
    add(
      'PUT /messages/:messageId/pin (tin của A)',
      'put',
      () => `/messages/${aliceMessage}/pin`,
      lowPriv,
    );
    add(
      'DELETE /messages/:messageId/pin (tin của A)',
      'delete',
      () => `/messages/${aliceMessage}/pin`,
      lowPriv,
    );

    // Trộn ID chéo server: bob là chủ B, dùng serverId của MÌNH nhưng ID tài nguyên của server A.
    add(
      'chéo: DELETE /servers/B/members/<member của A>',
      'delete',
      () => `/servers/${serverB}/members/${carolMemberA}`,
      [() => bob],
    );
    add(
      'chéo: PUT /servers/B/members/<member của A>/roles',
      'put',
      () => `/servers/${serverB}/members/${carolMemberA}/roles`,
      [() => bob],
      () => ({ roleIds: [] }),
    );
    add(
      'chéo: PUT /servers/B/members/<bob>/roles với role của A',
      'put',
      () => `/servers/${serverB}/members/${bobMemberB}/roles`,
      [() => bob],
      () => ({ roleIds: [roleA] }),
      [400, 403, 404], // role của A không thuộc server B: bị validate là 400, vẫn là từ chối
    );
    add(
      'chéo: PATCH /roles/<role của A> bởi chủ B',
      'patch',
      () => `/roles/${roleA}`,
      [() => bob],
      () => ({ name: 'taken' }),
    );
    add(
      'chéo: DELETE /channels/<channel của A> bởi chủ B',
      'delete',
      () => `/channels/${channelA}`,
      [() => bob],
    );
    add(
      'chéo: POST message vào channel của A bởi chủ B',
      'post',
      () => `/channels/${channelA}/messages`,
      [() => bob],
      () => ({ content: 'from B', nonce: randomUUID() }),
    );

    // TG.22: sticker của server A — kẻ ngoài không xem được picker, member thường thiếu
    // MANAGE_EXPRESSIONS (ADR-0067), và chủ server khác không xóa được sticker của A.
    add('GET /servers/:serverId/stickers', 'get', () => `/servers/${serverA}/stickers`, outsider);
    add(
      'POST /servers/:serverId/stickers',
      'post',
      () => `/servers/${serverA}/stickers`,
      lowPriv,
      () => ({ attachmentId: randomUUID(), name: 'x' }),
    );
    add('DELETE /stickers/<sticker của A>', 'delete', () => `/stickers/${stickerA}`, outsider);
    // TG.24: emoji của server A — kẻ ngoài không xóa được emoji của server người khác, member
    // thường thiếu MANAGE_EXPRESSIONS (ADR-0068 tái dùng bit sticker TG.22) nên không tạo được.
    add('DELETE /emojis/<emoji của A>', 'delete', () => `/emojis/${emojiA}`, outsider);
    add(
      'POST /servers/:serverId/emojis',
      'post',
      () => `/servers/${serverA}/emojis`,
      lowPriv,
      () => ({ attachmentId: randomUUID(), name: 'nope' }),
    );
    return out;
  };

  it('every attack is rejected with 403/404, leaks nothing, and changes nothing in server A', async () => {
    const before = await snapshotA();
    const failures: string[] = [];
    for (const attack of attacks()) {
      const actor = attack.by();
      const call = as(actor, attack.verb, attack.url());
      const res = attack.body ? await call.send(attack.body() as object) : await call;
      const label = `${attack.name} bởi ${actor.email.split('-')[1]}`;
      if (!attack.accept.includes(res.status)) failures.push(`${label}: status ${res.status}`);
      if (JSON.stringify(res.body).includes(SECRET))
        failures.push(`${label}: body lộ dữ liệu của server A`);
    }
    expect(failures).toEqual([]);
    expect(await snapshotA()).toEqual(before);
  });

  it('a plain member cannot read what they were never granted (controls: allowed paths still work)', async () => {
    // Đối chứng: chính các endpoint này CHO PHÉP thành viên hợp lệ, để test trên không "xanh vì hỏng hết".
    await as(carol, 'get', `/servers/${serverA}`).expect(200);
    await as(carol, 'get', `/channels/${channelA}/messages`).expect(200);
    await as(carol, 'patch', `/messages/${carolMessage}`)
      .send({ content: 'carol edits her own' })
      .expect(200);
    // TG.2: thành viên có ADD_REACTIONS vẫn thả được cảm xúc (đối chứng cho bảng tấn công).
    await as(
      carol,
      'put',
      `/messages/${aliceMessage}/reactions/${encodeURIComponent('👍')}`,
    ).expect(200);
    await as(alice, 'get', `/servers/${serverA}/roles`).expect(200);
  });

  it('no token → 401 on every endpoint that takes an id', async () => {
    const uuid = randomUUID();
    expect(ID_ROUTES).toHaveLength(51);
    for (const [verb, template] of ID_ROUTES) {
      const url = template.replaceAll(':id', uuid);
      const res = await as(undefined, verb, url).send({});
      // File capabilities use signed query authentication; missing credentials fail validation.
      expect(res.status, `${verb.toUpperCase()} ${url}`).toBe(
        template.endsWith('/file') ? 400 : 401,
      );
    }
  });

  it('ID_ROUTES lists every endpoint of the app that takes an id (a new one fails here until it is added)', () => {
    expect(discoverIdRoutes(app)).toEqual(
      ID_ROUTES.map(([verb, path]) => `${verb} ${path}`).sort(),
    );
  });

  it('a malformed id is a 400, never reaches the database', async () => {
    await as(alice, 'get', '/servers/not-a-uuid').expect(400);
    await as(alice, 'patch', '/messages/123').send({ content: 'x' }).expect(400);
  });
});
