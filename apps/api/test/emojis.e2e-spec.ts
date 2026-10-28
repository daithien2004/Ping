import type { INestApplication } from '@nestjs/common';
import { ErrorCodes, Limits } from '@ping/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootApp } from './helpers/boot.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { AttachmentWorker } from '../src/modules/attachments/attachment-worker.js';
import { LocalStorage } from '../src/modules/attachments/local-storage.js';
import { RedisProvider } from '../src/infra/redis/redis.module.js';

/**
 * TG.24 emoji tùy chỉnh (ADR-0068): kế thừa pattern TG.22 — Postgres thật, disk thật, worker
 * chạy thủ công qua `runOnce()`. Trần 50+50 chèn thẳng Prisma (pattern stickers.e2e-spec) để
 * giữ tổng số request thấp hơn giới hạn 100/phút/IP. Event `expressions.updated` phát ngay
 * trong request create/delete nên mọi ca dưới đây còn kiểm "không lỗi khi phát"; riêng việc
 * hai tab nhận event qua socket là việc của web e2e — không test ở đây.
 */
const runId = Date.now().toString(36);

const le24 = (n: number) => Buffer.from([n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff]);
const webpChunk = (type: string, data: Buffer) => {
  const head = Buffer.alloc(8);
  head.write(type, 0, 'ascii');
  head.writeUInt32LE(data.length, 4);
  return Buffer.concat([head, data, data.length % 2 ? Buffer.from([0]) : Buffer.alloc(0)]);
};

/** VP8L payload từ một WebP tĩnh do sharp sinh ra (bỏ vỏ RIFF, giữ đúng chiều dài khai báo). */
async function vp8lPayload(color: string): Promise<Buffer> {
  const file = await sharp({ create: { width: 64, height: 64, channels: 3, background: color } })
    .webp({ lossless: true })
    .toBuffer();
  const sub = file.subarray(12);
  const len = sub.readUInt32LE(4);
  return sub.subarray(8, 8 + len);
}

/**
 * WebP ĐỘNG tự dựng theo WebP container spec: VP8X (cờ animation) + ANIM + 2 khung ANMF
 * (fixture giống file-validation.spec — sharp không sinh được ảnh động từ đầu).
 */
async function animatedWebp(): Promise<Buffer> {
  const [f1, f2] = await Promise.all([vp8lPayload('red'), vp8lPayload('blue')]);
  const vp8x = webpChunk(
    'VP8X',
    Buffer.concat([Buffer.from([0x02]), Buffer.alloc(3), le24(63), le24(63)]),
  );
  const anmf = (payload: Buffer) =>
    webpChunk(
      'ANMF',
      Buffer.concat([
        le24(0),
        le24(0),
        le24(63),
        le24(63),
        le24(100),
        Buffer.from([0]),
        webpChunk('VP8L', payload),
      ]),
    );
  const body = Buffer.concat([vp8x, webpChunk('ANIM', Buffer.alloc(6)), anmf(f1), anmf(f2)]);
  const size = Buffer.alloc(4);
  size.writeUInt32LE(4 + body.length);
  return Buffer.concat([Buffer.from('RIFF'), size, Buffer.from('WEBP'), body]);
}

describe('TG.24 custom emoji (real Postgres + disk)', () => {
  let app: INestApplication;
  let db: PrismaService;
  let worker: AttachmentWorker;
  let token = ''; // chủ server A (owner → quản lý được emoji)
  let member = ''; // member thường của A (chỉ @everyone)
  let outsider = ''; // không thuộc server nào
  let boss = ''; // chủ server B (đối thủ chéo server)
  let ownerId = '';
  let serverId = '';
  let channelId = '';
  let serverB = '';
  let firstEmojiId = ''; // emoji ca đầu ('parrot') — tái dùng cho tin/reaction/xóa
  let firstAttachmentId = '';
  let tokenMessageId = ''; // tin chứa token emoji sống, kiểm placeholder sau xóa
  let deadEmojiId = ''; // emoji seed bị xóa mềm (token chết cho tin + reaction)
  let rivalEmojiId = ''; // emoji của server B (chéo server cho tin + reaction)
  let reactionMessageId = '';
  let png: Buffer;
  let png200: Buffer; // tĩnh 200×200 — vượt cạnh 128 → worker từ chối
  const emails: string[] = [];
  const ids: string[] = []; // attachment id (dọn tệp raw/ready/thumb trên disk)
  const http = () => request(app.getHttpServer());
  const auth = (call: request.Test, bearer = token) =>
    call.set('Authorization', `Bearer ${bearer}`);

  /** Pipeline upload scope 'customEmoji' tới khi worker kiểm định xong (pattern `ready()` của TG.6). */
  async function readyEmoji(
    bytes = png,
    filename = 'emoji.png',
    bearer = token,
    target = serverId,
  ) {
    const res = await auth(http().post('/api/v1/uploads'), bearer)
      .send({
        scope: 'customEmoji',
        serverId: target,
        filename,
        sizeBytes: bytes.length,
        nonce: randomUUID(),
      })
      .expect(201);
    const id = res.body.id as string;
    ids.push(id);
    await auth(http().put(`/api/v1/uploads/${id}/content`), bearer)
      .set('Content-Type', 'application/octet-stream')
      .send(bytes)
      .expect(200);
    await auth(http().post(`/api/v1/uploads/${id}/complete`), bearer).expect(201);
    for (let i = 0; i < 20; i++) {
      await worker.runOnce();
      const row = await db.attachment.findUniqueOrThrow({ where: { id } });
      if (['ready', 'rejected'].includes(row.status)) return { id, status: row.status };
    }
    throw new Error('Worker did not finish');
  }

  /**
   * Hàng emoji tối thiểu chèn thẳng DB: tệp "ready" giả định, worker quét không đụng tới.
   * Tên chỉ [a-z0-9_] (không gạch ngang) để token `:ten:<id>` khớp regex của TG.4.
   */
  async function seedEmoji(name: string, targetServerId: string, animated = false) {
    const attachment = await db.attachment.create({
      data: {
        uploaderId: ownerId,
        nonce: randomUUID(),
        filename: `${name}.webp`,
        sizeBytes: 64,
        quotaBytes: 64,
        scope: 'customEmoji',
        serverId: targetServerId,
        status: 'ready',
        boundAt: new Date(),
        rawRemoved: true, // worker chỉ xử lý hàng ready khi raw chưa dọn
        mime: 'image/webp',
        width: 8,
        height: 8,
      },
    });
    return db.customEmoji.create({
      data: {
        serverId: targetServerId,
        name,
        animated,
        attachmentId: attachment.id,
        createdBy: ownerId,
      },
    });
  }

  beforeAll(async () => {
    app = await bootApp();
    db = app.get(PrismaService);
    worker = app.get(AttachmentWorker);
    await app.get(RedisProvider).flushdb();
    // 4 user là mức tối đa hợp lý dưới giới hạn 10 register/phút/IP của e2e.
    for (const [index, label] of ['owner', 'member', 'outsider', 'boss'].entries()) {
      const suffix = randomUUID().slice(0, 8);
      const email = `emoji-${label}-${suffix}@ping.dev`;
      emails.push(email);
      const res = await http()
        .post('/api/v1/auth/register')
        .send({ email, username: `e${index}${suffix}`, password: 'password123' })
        .expect(201);
      if (label === 'owner') {
        token = res.body.accessToken;
        ownerId = res.body.user.id;
      } else if (label === 'member') member = res.body.accessToken;
      else if (label === 'outsider') outsider = res.body.accessToken;
      else boss = res.body.accessToken;
    }
    const server = await auth(http().post('/api/v1/servers'))
      .send({ name: 'Emoji test', nonce: randomUUID() })
      .expect(201);
    serverId = server.body.id;
    channelId = server.body.channels[0].id;
    await auth(http().post('/api/v1/servers/join'), member)
      .send({ inviteCode: server.body.inviteCode })
      .expect(201);
    const rival = await auth(http().post('/api/v1/servers'), boss)
      .send({ name: 'Emoji rival', nonce: randomUUID() })
      .expect(201);
    serverB = rival.body.id;
    png = await sharp({ create: { width: 32, height: 32, channels: 3, background: 'blue' } })
      .png()
      .toBuffer();
    png200 = await sharp({ create: { width: 200, height: 200, channels: 3, background: 'red' } })
      .png()
      .toBuffer();
    // Emoji đối thủ của server B (chủ B tự tạo) — dùng kiểm chéo server cho tin + reaction.
    const rivalUpload = await readyEmoji(png, 'rival.png', boss, serverB);
    rivalEmojiId = (
      await auth(http().post(`/api/v1/servers/${serverB}/emojis`), boss)
        .send({ attachmentId: rivalUpload.id, name: 'rival' })
        .expect(201)
    ).body.id;
  });

  afterAll(async () => {
    if (!db) return;
    const storage = app.get(LocalStorage);
    for (const id of ids)
      for (const suffix of ['raw', 'ready', 'thumb']) await storage.remove(`${id}.${suffix}`);
    // Emoji khóa attachment (Restrict): xóa emoji trước attachment. AuditLog không có FK → xóa tay.
    const servers = [serverId, serverB].filter(Boolean);
    if (servers.length) {
      await db.customEmoji.deleteMany({ where: { serverId: { in: servers } } });
      await db.attachment.deleteMany({ where: { serverId: { in: servers } } });
      await db.auditLog.deleteMany({ where: { serverId: { in: servers } } });
    }
    const users = await db.user.findMany({
      where: { email: { in: emails } },
      select: { id: true },
    });
    const userIds = users.map((u) => u.id);
    // Server A của owner + server B của boss; tin nhắn + cảm xúc cascade theo channel.
    if (userIds.length) await db.server.deleteMany({ where: { ownerId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it('creates an emoji from a validated upload and lists it for the server', async () => {
    // Pipeline scope 'customEmoji': worker kiểm định PNG 32x32 → WebP ready ≤128×128.
    const { id } = await readyEmoji();
    firstAttachmentId = id;
    const created = await auth(http().post(`/api/v1/servers/${serverId}/emojis`))
      .send({ attachmentId: id, name: 'parrot' })
      .expect(201);
    firstEmojiId = created.body.id;
    // CustomEmojiDto đủ trường; ảnh tĩnh → animated false, kích thước giữ nguyên.
    expect(created.body).toMatchObject({ name: 'parrot', animated: false, width: 32, height: 32 });
    expect(created.body.url).toContain('/file?');
    expect(created.body.previewUrl).toContain('/file?');
    // GET list: emoji phẳng (không gói như sticker) nằm trong danh sách của server.
    const list = await auth(http().get(`/api/v1/servers/${serverId}/emojis`)).expect(200);
    const found = list.body.emojis.find((e: { id: string }) => e.id === firstEmojiId);
    expect(found).toBeDefined();
    expect(found).toMatchObject({ name: 'parrot', animated: false });
    expect(found.url).toContain('/file?');
    expect(found.previewUrl).toContain('/file?');
  });

  it('lets a plain member view the list but not create emojis, and denies outsiders', async () => {
    // @everyone không có MANAGE_EXPRESSIONS (ADR-0068 tái dùng bit sticker TG.22) → 403.
    await auth(http().post(`/api/v1/servers/${serverId}/emojis`), member)
      .send({ attachmentId: randomUUID(), name: 'nope' })
      .expect(403);
    // Mọi member xem được danh sách (view Sticker cấp mặc định).
    const list = await auth(http().get(`/api/v1/servers/${serverId}/emojis`), member).expect(200);
    expect(Array.isArray(list.body.emojis)).toBe(true);
    // Người ngoài server không xem được danh sách emoji.
    await auth(http().get(`/api/v1/servers/${serverId}/emojis`), outsider).expect(403);
  });

  it('rejects a 200x200 static image at emoji validation and refuses to claim it', async () => {
    // Emoji tĩnh phải ≤128×128 (ADR-0068) — khác sticker (fit 512): 200×200 bị worker từ chối.
    const { id, status } = await readyEmoji(png200, 'big.png');
    expect(status).toBe('rejected');
    // Claim tệp chưa 'ready' → 400, không tạo được emoji.
    await auth(http().post(`/api/v1/servers/${serverId}/emojis`))
      .send({ attachmentId: id, name: 'big' })
      .expect(400);
  });

  // Ca retry idempotent đứng TRƯỚC ca trần: ở trần 50/50, lượt tạo bị chặn ở bước đếm trước
  // khi rẽ vào nhánh trả lại emoji cũ là rủi ro không cần thiết (pattern stickers.e2e-spec).
  it('retries idempotently: posting twice with the same attachmentId returns the original emoji', async () => {
    // Claim lần 2 cùng tệp → ATTACHMENT_ALREADY_BOUND → service trả lại emoji cũ.
    const again = await auth(http().post(`/api/v1/servers/${serverId}/emojis`))
      .send({ attachmentId: firstAttachmentId, name: 'parrot' })
      .expect(201);
    expect(again.body.id).toBe(firstEmojiId);
  });

  it(`caps a server at ${Limits.EMOJIS_STATIC_PER_SERVER} static emojis and frees the slot after soft delete`, async () => {
    // Chèn thẳng tới trần - 1 (chừa một slot cho lượt tạo qua API) — không đốt request.
    const current = await db.customEmoji.count({
      where: { serverId, deletedAt: null, animated: false },
    });
    for (let i = current; i < Limits.EMOJIS_STATIC_PER_SERVER - 1; i++)
      await seedEmoji(`bulk${runId}${i}`, serverId);
    // Đủ 50: emoji cuối cùng qua API vẫn vừa khít trần.
    const slot = await readyEmoji();
    const fiftieth = await auth(http().post(`/api/v1/servers/${serverId}/emojis`))
      .send({ attachmentId: slot.id, name: 'fiftieth' })
      .expect(201);
    // Thứ 51 vượt trần → 400 EMOJI_LIMIT_REACHED kèm details.bucket.
    // (Tên chỉ [a-z0-9_]: khác schema sticker, emoji không nhận gạch ngang.)
    const overflow = await readyEmoji();
    const denied = await auth(http().post(`/api/v1/servers/${serverId}/emojis`))
      .send({ attachmentId: overflow.id, name: 'one_too_many' })
      .expect(400);
    expect(denied.body.code).toBe(ErrorCodes.EMOJI_LIMIT_REACHED);
    expect(denied.body.details).toEqual({ bucket: 'static' });
    // Xóa mềm một emoji chèn thẳng → slot được giải phóng, tệp overflow tạo lại được.
    const victim = await db.customEmoji.findFirstOrThrow({
      where: { serverId, deletedAt: null, name: { startsWith: 'bulk' } },
      select: { id: true },
    });
    await db.customEmoji.update({ where: { id: victim.id }, data: { deletedAt: new Date() } });
    const retry = await auth(http().post(`/api/v1/servers/${serverId}/emojis`))
      .send({ attachmentId: overflow.id, name: 'one_too_many' })
      .expect(201);
    expect(retry.body.id).not.toBe(fiftieth.body.id);
  });

  it(`caps the animated bucket separately at ${Limits.EMOJIS_ANIMATED_PER_SERVER}`, async () => {
    // Trần bucket động tính riêng: chèn đủ 50 hàng động, upload WebP động thật qua API —
    // worker giữ chuyển động (pages > 1) nên service rẽ vào bucket animated → 400.
    for (let i = 0; i < Limits.EMOJIS_ANIMATED_PER_SERVER; i++)
      await seedEmoji(`anim${runId}${i}`, serverId, true);
    const { id } = await readyEmoji(await animatedWebp(), 'dance.webp');
    const denied = await auth(http().post(`/api/v1/servers/${serverId}/emojis`))
      .send({ attachmentId: id, name: 'dance' })
      .expect(400);
    expect(denied.body.code).toBe(ErrorCodes.EMOJI_LIMIT_REACHED);
    expect(denied.body.details).toEqual({ bucket: 'animated' });
  });

  it('sends messages with custom emoji tokens: live own ok, cross-server 400, dead and forged pass', async () => {
    // Token của emoji server mình còn sống → 201, content giữ nguyên token (client tự render).
    const live = `xin chào :parrot:${firstEmojiId}`;
    const sent = await auth(http().post(`/api/v1/channels/${channelId}/messages`))
      .send({ content: live, nonce: randomUUID() })
      .expect(201);
    tokenMessageId = sent.body.id;
    expect(sent.body.content).toBe(live);
    // Token của emoji server KHÁC còn sống → 400 (không lộ sự tồn tại của emoji đó).
    await auth(http().post(`/api/v1/channels/${channelId}/messages`))
      .send({ content: `trộm :rival:${rivalEmojiId}`, nonce: randomUUID() })
      .expect(400);
    // Token trỏ emoji vừa xóa mềm → vẫn 201 (client render placeholder chip mờ, ADR-0068 mục 3).
    const victim = await db.customEmoji.findFirstOrThrow({
      where: { serverId, deletedAt: { not: null }, name: { startsWith: 'bulk' } },
      select: { id: true, name: true },
    });
    deadEmojiId = victim.id;
    const dead = `nhớ :${victim.name}:${deadEmojiId}`;
    const deadSent = await auth(http().post(`/api/v1/channels/${channelId}/messages`))
      .send({ content: dead, nonce: randomUUID() })
      .expect(201);
    expect(deadSent.body.content).toBe(dead);
    // Token bịa (uuid ngẫu nhiên không tồn tại) → vẫn 201.
    const forged = `:ghost:${randomUUID()}`;
    const fake = await auth(http().post(`/api/v1/channels/${channelId}/messages`))
      .send({ content: forged, nonce: randomUUID() })
      .expect(201);
    expect(fake.body.content).toBe(forged);
  });

  it('reacts with a custom emoji token and rejects dead or cross-server tokens', async () => {
    const sent = await auth(http().post(`/api/v1/channels/${channelId}/messages`), member)
      .send({ content: 'thả cảm xúc đi', nonce: randomUUID() })
      .expect(201);
    reactionMessageId = sent.body.id;
    const react = (emoji: string, bearer = token) =>
      auth(
        http().put(`/api/v1/messages/${reactionMessageId}/reactions/${encodeURIComponent(emoji)}`),
        bearer,
      );
    // Token `c:<id>` của emoji còn sống đúng server → 200, tổng hợp mang nguyên token.
    const liveToken = `c:${firstEmojiId}`;
    const added = await react(liveToken).expect(200);
    expect(added.body.reactions).toEqual([{ emoji: liveToken, count: 1, me: true }]);
    // GET messages: pill cảm xúc trả token `c:<id>` cho client render ảnh.
    const page = await auth(http().get(`/api/v1/channels/${channelId}/messages`)).expect(200);
    const old = page.body.messages.find((m: { id: string }) => m.id === reactionMessageId);
    expect(old.reactions).toEqual([{ emoji: liveToken, count: 1, me: true }]);
    // Token của emoji server khác (còn sống) → 400 REACTION_EMOJI_INVALID, không lộ emoji.
    const cross = await react(`c:${rivalEmojiId}`).expect(400);
    expect(cross.body.code).toBe(ErrorCodes.REACTION_EMOJI_INVALID);
    // Token của emoji đã xóa mềm → cùng mã lỗi.
    const dead = await react(`c:${deadEmojiId}`).expect(400);
    expect(dead.body.code).toBe(ErrorCodes.REACTION_EMOJI_INVALID);
    // Emoji unicode thường vẫn hoạt động song song.
    await react('👍').expect(200);
    // Gỡ cảm xúc token → 200, chỉ còn cảm xúc unicode.
    const removed = await auth(
      http().delete(
        `/api/v1/messages/${reactionMessageId}/reactions/${encodeURIComponent(liveToken)}`,
      ),
    ).expect(200);
    expect(removed.body.reactions).toEqual([{ emoji: '👍', count: 1, me: true }]);
  });

  it('deletes an emoji: member forbidden, manager succeeds, old messages keep the raw token', async () => {
    // Member thường thiếu delete Sticker (subject tái dùng của TG.22).
    await auth(http().delete(`/api/v1/emojis/${firstEmojiId}`), member).expect(403);
    // Manager xóa mềm; tệp emoji chuyển 'deleting' cho worker dọn.
    const removed = await auth(http().delete(`/api/v1/emojis/${firstEmojiId}`)).expect(200);
    expect(removed.body).toEqual({ id: firstEmojiId });
    // Danh sách không còn emoji đã xóa (soft-delete ẩn khỏi picker).
    const list = await auth(http().get(`/api/v1/servers/${serverId}/emojis`)).expect(200);
    expect(list.body.emojis.map((e: { id: string }) => e.id)).not.toContain(firstEmojiId);
    // Tin cũ (gửi trước khi xóa) VẪN chứa token — placeholder là việc của client (ADR-0068).
    const page = await auth(http().get(`/api/v1/channels/${channelId}/messages`)).expect(200);
    const old = page.body.messages.find((m: { id: string }) => m.id === tokenMessageId);
    expect(old.content).toBe(`xin chào :parrot:${firstEmojiId}`);
    // Xóa lần nữa → 404 (đã soft-delete).
    await auth(http().delete(`/api/v1/emojis/${firstEmojiId}`)).expect(404);
  });

  it('writes an EMOJI_DELETE audit row for the manager deletion above', async () => {
    // Quy tắc 11: xóa emoji là hành động quản trị — phải còn sổ sách theo targetId.
    const rows = await db.auditLog.findMany({
      where: { serverId, action: 'EMOJI_DELETE', targetId: firstEmojiId },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.actorId).toBe(ownerId);
  });
});
