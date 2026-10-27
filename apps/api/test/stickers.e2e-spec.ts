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
 * TG.22 sticker (ADR-0067): kế thừa pattern TG.6 — Postgres thật, disk thật, worker chạy
 * thủ công qua `runOnce()`. Trần 30 và các hàng phụ (gói hệ thống) chèn thẳng Prisma
 * (pattern limits.e2e-spec) để giữ tổng số request thấp hơn giới hạn 100/phút/IP.
 */
const runId = Date.now().toString(36);

describe('TG.22 stickers (real Postgres + disk)', () => {
  let app: INestApplication;
  let db: PrismaService;
  let worker: AttachmentWorker;
  let token = ''; // chủ server A (owner → quản lý được sticker)
  let member = ''; // member thường của A (chỉ @everyone)
  let outsider = ''; // không thuộc server nào
  let boss = ''; // chủ server B (đối thủ IDOR chéo server)
  let ownerId = '';
  let serverId = '';
  let channelId = '';
  let channelB = '';
  let systemPackId = '';
  let systemStickerId = '';
  let firstStickerId = ''; // sticker của ca đầu, tái dùng các ca sau
  let firstAttachmentId = '';
  let stickerMessageId = ''; // tin sticker dùng kiểm preview sau xóa
  let png: Buffer;
  let jpeg: Buffer;
  const emails: string[] = [];
  const ids: string[] = []; // attachment id (dọn tệp raw/ready/thumb trên disk)
  const http = () => request(app.getHttpServer());
  const auth = (call: request.Test, bearer = token) =>
    call.set('Authorization', `Bearer ${bearer}`);

  /** Pipeline upload scope 'sticker' tới khi worker kiểm định xong (pattern `ready()` của TG.6). */
  async function readySticker(bytes = png, filename = 'sticker.png') {
    const res = await auth(http().post('/api/v1/uploads'))
      .send({ scope: 'sticker', serverId, filename, sizeBytes: bytes.length, nonce: randomUUID() })
      .expect(201);
    const id = res.body.id as string;
    ids.push(id);
    await auth(http().put(`/api/v1/uploads/${id}/content`))
      .set('Content-Type', 'application/octet-stream')
      .send(bytes)
      .expect(200);
    await auth(http().post(`/api/v1/uploads/${id}/complete`)).expect(201);
    for (let i = 0; i < 20; i++) {
      await worker.runOnce();
      const row = await db.attachment.findUniqueOrThrow({ where: { id } });
      if (['ready', 'rejected'].includes(row.status)) return { id, status: row.status };
    }
    throw new Error('Worker did not finish');
  }

  /** Hàng sticker tối thiểu chèn thẳng DB: tệp "ready" giả định, worker quét không đụng tới. */
  async function seedSticker(name: string, packId: string, fileServerId: string | null) {
    const attachment = await db.attachment.create({
      data: {
        uploaderId: ownerId,
        nonce: randomUUID(),
        filename: `${name}.webp`,
        sizeBytes: 64,
        quotaBytes: 64,
        scope: 'sticker',
        serverId: fileServerId,
        status: 'ready',
        boundAt: new Date(),
        rawRemoved: true, // worker chỉ xử lý hàng ready khi raw chưa dọn
        mime: 'image/webp',
        width: 8,
        height: 8,
      },
    });
    return db.sticker.create({
      data: { packId, name, tags: [], attachmentId: attachment.id, createdBy: ownerId },
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
      const email = `sticker-${label}-${suffix}@ping.dev`;
      emails.push(email);
      const res = await http()
        .post('/api/v1/auth/register')
        .send({ email, username: `s${index}${suffix}`, password: 'password123' })
        .expect(201);
      if (label === 'owner') {
        token = res.body.accessToken;
        ownerId = res.body.user.id;
      } else if (label === 'member') member = res.body.accessToken;
      else if (label === 'outsider') outsider = res.body.accessToken;
      else boss = res.body.accessToken;
    }
    const server = await auth(http().post('/api/v1/servers'))
      .send({ name: 'Sticker test', nonce: randomUUID() })
      .expect(201);
    serverId = server.body.id;
    channelId = server.body.channels[0].id;
    await auth(http().post('/api/v1/servers/join'), member)
      .send({ inviteCode: server.body.inviteCode })
      .expect(201);
    const rival = await auth(http().post('/api/v1/servers'), boss)
      .send({ name: 'Sticker rival', nonce: randomUUID() })
      .expect(201);
    channelB = rival.body.channels[0].id;
    png = await sharp({ create: { width: 32, height: 24, channels: 3, background: 'blue' } })
      .png()
      .toBuffer();
    jpeg = await sharp({ create: { width: 20, height: 12, channels: 3, background: 'green' } })
      .jpeg()
      .toBuffer();
    // Gói hệ thống + một sticker hệ thống (seed e2e không có): tệp gắn serverId thật để
    // nhánh dọn của worker (scope sticker) không rơi vào server null.
    const pack = await db.stickerPack.create({ data: { serverId: null, name: `sys-${runId}` } });
    systemPackId = pack.id;
    systemStickerId = (await seedSticker(`sys-${runId}`, systemPackId, serverId)).id;
  });

  afterAll(async () => {
    if (!db) return;
    const storage = app.get(LocalStorage);
    for (const id of ids)
      for (const suffix of ['raw', 'ready', 'thumb']) await storage.remove(`${id}.${suffix}`);
    // Sticker khóa attachment (Restrict): xóa sticker trước. Gói hệ thống (serverId null)
    // phải xóa tay; gói của server cascade theo server. AuditLog không có FK → xóa tay.
    if (systemPackId) {
      await db.sticker.deleteMany({ where: { packId: systemPackId } });
      await db.stickerPack.deleteMany({ where: { id: systemPackId } });
    }
    if (serverId) await db.sticker.deleteMany({ where: { pack: { serverId } } });
    if (ownerId) await db.attachment.deleteMany({ where: { uploaderId: ownerId } });
    if (serverId) await db.auditLog.deleteMany({ where: { serverId } });
    const users = await db.user.findMany({
      where: { email: { in: emails } },
      select: { id: true },
    });
    const userIds = users.map((u) => u.id);
    // Server A của owner + server B của boss; tin nhắn cascade theo channel.
    if (userIds.length) await db.server.deleteMany({ where: { ownerId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it('creates a sticker from a validated upload and lists it inside the server pack', async () => {
    // Pipeline scope 'sticker': worker kiểm định PNG 32x24 → WebP ready, giữ kích thước.
    const { id } = await readySticker();
    firstAttachmentId = id;
    const created = await auth(http().post(`/api/v1/servers/${serverId}/stickers`))
      .send({ attachmentId: id, name: 'tada', tags: ['fun'] })
      .expect(201);
    firstStickerId = created.body.id;
    // StickerDto đủ trường; url/previewUrl là URL ký 30 ngày trên đường /file.
    expect(created.body).toMatchObject({ name: 'tada', tags: ['fun'], width: 32, height: 24 });
    expect(created.body.packId).toBeTruthy();
    expect(created.body.url).toContain('/file?');
    expect(created.body.previewUrl).toContain('/file?');
    // GET list: gói của server chứa sticker vừa tạo (bên cạnh gói hệ thống nếu có).
    const list = await auth(http().get(`/api/v1/servers/${serverId}/stickers`)).expect(200);
    const pack = list.body.packs.find((p: { serverId: string | null }) => p.serverId === serverId);
    expect(pack).toBeDefined();
    const inPack = pack.stickers.find((s: { id: string }) => s.id === firstStickerId);
    expect(inPack).toBeDefined();
    expect(inPack.url).toContain('/file?');
    expect(inPack.previewUrl).toContain('/file?');
  });

  it('lets a plain member view the picker but not create stickers', async () => {
    // @everyone không có MANAGE_EXPRESSIONS (ADR-0067) → 403 dù body hợp lệ.
    await auth(http().post(`/api/v1/servers/${serverId}/stickers`), member)
      .send({ attachmentId: randomUUID(), name: 'nope' })
      .expect(403);
    // Mọi member xem được danh sách (view Sticker cấp mặc định).
    const list = await auth(http().get(`/api/v1/servers/${serverId}/stickers`), member).expect(200);
    expect(Array.isArray(list.body.packs)).toBe(true);
  });

  it('denies an outsider the sticker list of a server they are not in', async () => {
    await auth(http().get(`/api/v1/servers/${serverId}/stickers`), outsider).expect(403);
  });

  it('rejects a JPEG at sticker validation and refuses to claim it', async () => {
    // Kiểm định sticker chỉ nhận PNG/WebP (tĩnh + động) — JPEG bị worker từ chối.
    const { id, status } = await readySticker(jpeg, 'photo.jpg');
    expect(status).toBe('rejected');
    // Claim tệp chưa 'ready' → 400, không tạo được sticker.
    await auth(http().post(`/api/v1/servers/${serverId}/stickers`))
      .send({ attachmentId: id, name: 'jpeg' })
      .expect(400);
  });

  it('sends a sticker message with empty content and refuses content next to a sticker', async () => {
    const sent = await auth(http().post(`/api/v1/channels/${channelId}/messages`), member)
      .send({ content: '', nonce: randomUUID(), stickerId: firstStickerId })
      .expect(201);
    stickerMessageId = sent.body.id;
    // MessageDto: kind 'sticker' + preview đầy đủ URL, chưa xóa.
    expect(sent.body.kind).toBe('sticker');
    expect(sent.body.sticker).toMatchObject({ id: firstStickerId, name: 'tada', deleted: false });
    expect(sent.body.sticker.url).toContain('/file?');
    expect(sent.body.sticker.previewUrl).toContain('/file?');
    // Schema: tin sticker bắt buộc content rỗng.
    await auth(http().post(`/api/v1/channels/${channelId}/messages`), member)
      .send({ content: 'kèm chữ', nonce: randomUUID(), stickerId: firstStickerId })
      .expect(400);
  });

  it('hides a cross-server sticker behind a plain 400 while the system pack works everywhere', async () => {
    // Chủ server B gửi stickerId của server A vào channel B → 400, không lộ chi tiết.
    await auth(http().post(`/api/v1/channels/${channelB}/messages`), boss)
      .send({ content: '', nonce: randomUUID(), stickerId: firstStickerId })
      .expect(400);
    // Gói hệ thống dùng được ở mọi server: member của A gửi được trong channel A
    // (skip khi DB chưa có sticker hệ thống nào).
    const systemCount = await db.sticker.count({ where: { pack: { serverId: null } } });
    if (!systemCount) return;
    const sent = await auth(http().post(`/api/v1/channels/${channelId}/messages`), member)
      .send({ content: '', nonce: randomUUID(), stickerId: systemStickerId })
      .expect(201);
    expect(sent.body.sticker.id).toBe(systemStickerId);
  });

  it('never edits a sticker message but still deletes it like a normal one', async () => {
    const sent = await auth(http().post(`/api/v1/channels/${channelId}/messages`), member)
      .send({ content: '', nonce: randomUUID(), stickerId: firstStickerId })
      .expect(201);
    // Tin sticker không có nội dung để sửa → PATCH bị chặn thẳng.
    await auth(http().patch(`/api/v1/messages/${sent.body.id}`), member)
      .send({ content: 'edit' })
      .expect(400);
    // Xóa tin sticker vẫn như tin thường: remove trả {id}.
    const removed = await auth(http().delete(`/api/v1/messages/${sent.body.id}`), member).expect(
      200,
    );
    expect(removed.body).toEqual({ id: sent.body.id });
  });

  // Ca retry idempotent đứng TRƯỚC ca trần: ở trần 30/30, lượt tạo (dù tệp đã bound)
  // bị chặn ở bước đếm trước khi rẽ vào nhánh trả lại sticker cũ.
  it('retries idempotently: posting twice with the same attachmentId returns the original sticker', async () => {
    // Claim lần 2 cùng tệp → ATTACHMENT_ALREADY_BOUND → service trả lại sticker cũ.
    const again = await auth(http().post(`/api/v1/servers/${serverId}/stickers`))
      .send({ attachmentId: firstAttachmentId, name: 'tada' })
      .expect(201);
    expect(again.body.id).toBe(firstStickerId);
  });

  it(`caps a server at ${Limits.STICKERS_PER_SERVER} stickers and frees the slot after soft delete`, async () => {
    const pack = await db.stickerPack.findFirstOrThrow({ where: { serverId } });
    // Chèn thẳng tới trần - 1 (chừa một slot cho lượt tạo qua API) — không đốt request.
    const current = await db.sticker.count({ where: { packId: pack.id, deletedAt: null } });
    for (let i = current; i < Limits.STICKERS_PER_SERVER - 1; i++)
      await seedSticker(`bulk-${runId}-${i}`, pack.id, serverId);
    // Đủ 30: sticker cuối cùng qua API vẫn vừa khít trần.
    const slot = await readySticker();
    const thirtieth = await auth(http().post(`/api/v1/servers/${serverId}/stickers`))
      .send({ attachmentId: slot.id, name: 'thirtieth' })
      .expect(201);
    // Thứ 31 vượt trần → 400 STICKER_LIMIT_REACHED.
    const overflow = await readySticker();
    const denied = await auth(http().post(`/api/v1/servers/${serverId}/stickers`))
      .send({ attachmentId: overflow.id, name: 'one-too-many' })
      .expect(400);
    expect(denied.body.code).toBe(ErrorCodes.STICKER_LIMIT_REACHED);
    // Xóa mềm một sticker chèn thẳng → slot được giải phóng, tệp overflow tạo lại được.
    const victim = await db.sticker.findFirstOrThrow({
      where: { packId: pack.id, deletedAt: null, name: { startsWith: 'bulk-' } },
      select: { id: true },
    });
    await db.sticker.update({ where: { id: victim.id }, data: { deletedAt: new Date() } });
    const retry = await auth(http().post(`/api/v1/servers/${serverId}/stickers`))
      .send({ attachmentId: overflow.id, name: 'one-too-many' })
      .expect(201);
    expect(retry.body.id).not.toBe(thirtieth.body.id);
  });

  it('deletes a sticker: member forbidden, manager succeeds, old messages show the deleted frame', async () => {
    // Member thường thiếu delete Sticker.
    await auth(http().delete(`/api/v1/stickers/${firstStickerId}`), member).expect(403);
    // Manager xóa mềm; tệp sticker chuyển 'deleting' cho worker dọn.
    const removed = await auth(http().delete(`/api/v1/stickers/${firstStickerId}`)).expect(200);
    expect(removed.body).toEqual({ id: firstStickerId });
    // Danh sách không còn sticker đã xóa (soft-delete ẩn khỏi picker).
    const list = await auth(http().get(`/api/v1/servers/${serverId}/stickers`)).expect(200);
    const pack = list.body.packs.find((p: { serverId: string | null }) => p.serverId === serverId);
    expect(pack.stickers.map((s: { id: string }) => s.id)).not.toContain(firstStickerId);
    // Tin cũ render khung "sticker đã bị xóa": còn id + tên, mất URL.
    const page = await auth(http().get(`/api/v1/channels/${channelId}/messages`)).expect(200);
    const old = page.body.messages.find((m: { id: string }) => m.id === stickerMessageId);
    expect(old.sticker).toMatchObject({
      id: firstStickerId,
      name: 'tada',
      deleted: true,
      url: null,
      previewUrl: null,
    });
    // Xóa lần nữa → 404 (đã soft-delete).
    await auth(http().delete(`/api/v1/stickers/${firstStickerId}`)).expect(404);
    // Sticker gói hệ thống là tài sản của dự án: không ai xóa được.
    await auth(http().delete(`/api/v1/stickers/${systemStickerId}`)).expect(403);
  });

  it('writes a STICKER_DELETE audit row for the manager deletion above', async () => {
    // Quy tắc 11: xóa sticker là hành động quản trị — phải còn sổ sách theo targetId.
    const rows = await db.auditLog.findMany({
      where: { serverId, action: 'STICKER_DELETE', targetId: firstStickerId },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.actorId).toBe(ownerId);
  });
});
