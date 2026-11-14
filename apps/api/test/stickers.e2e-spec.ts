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

const runId = Date.now().toString(36);

describe('TG.22 stickers (real Postgres + disk)', () => {
  let app: INestApplication;
  let db: PrismaService;
  let worker: AttachmentWorker;
  let token = '';
  let member = '';
  let outsider = '';
  let boss = '';
  let ownerId = '';
  let serverId = '';
  let channelId = '';
  let channelB = '';
  let systemPackId = '';
  let systemStickerId = '';
  let firstStickerId = '';
  let firstAttachmentId = '';
  let stickerMessageId = '';
  let png: Buffer;
  let jpeg: Buffer;
  const emails: string[] = [];
  const ids: string[] = [];
  const http = () => request(app.getHttpServer());
  const auth = (call: request.Test, bearer = token) =>
    call.set('Authorization', `Bearer ${bearer}`);

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
        rawRemoved: true,
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
    // Seed e2e không có sticker hệ thống: gắn serverId thật để nhánh dọn của worker không rơi vào server null.
    const pack = await db.stickerPack.create({ data: { serverId: null, name: `sys-${runId}` } });
    systemPackId = pack.id;
    systemStickerId = (await seedSticker(`sys-${runId}`, systemPackId, serverId)).id;
  });

  afterAll(async () => {
    if (!db) return;
    const storage = app.get(LocalStorage);
    for (const id of ids)
      for (const suffix of ['raw', 'ready', 'thumb']) await storage.remove(`${id}.${suffix}`);
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
    if (userIds.length) await db.server.deleteMany({ where: { ownerId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it('creates a sticker from a validated upload and lists it inside the server pack', async () => {
    const { id } = await readySticker();
    firstAttachmentId = id;
    const created = await auth(http().post(`/api/v1/servers/${serverId}/stickers`))
      .send({ attachmentId: id, name: 'tada', tags: ['fun'] })
      .expect(201);
    firstStickerId = created.body.id;
    expect(created.body).toMatchObject({ name: 'tada', tags: ['fun'], width: 32, height: 24 });
    expect(created.body.packId).toBeTruthy();
    expect(created.body.url).toContain('/file?');
    expect(created.body.previewUrl).toContain('/file?');
    const list = await auth(http().get(`/api/v1/servers/${serverId}/stickers`)).expect(200);
    const pack = list.body.packs.find((p: { serverId: string | null }) => p.serverId === serverId);
    expect(pack).toBeDefined();
    const inPack = pack.stickers.find((s: { id: string }) => s.id === firstStickerId);
    expect(inPack).toBeDefined();
    expect(inPack.url).toContain('/file?');
    expect(inPack.previewUrl).toContain('/file?');
  });

  it('lets a plain member view the picker but not create stickers', async () => {
    await auth(http().post(`/api/v1/servers/${serverId}/stickers`), member)
      .send({ attachmentId: randomUUID(), name: 'nope' })
      .expect(403);
    const list = await auth(http().get(`/api/v1/servers/${serverId}/stickers`), member).expect(200);
    expect(Array.isArray(list.body.packs)).toBe(true);
  });

  it('denies an outsider the sticker list of a server they are not in', async () => {
    await auth(http().get(`/api/v1/servers/${serverId}/stickers`), outsider).expect(403);
  });

  it('rejects a JPEG at sticker validation and refuses to claim it', async () => {
    const { id, status } = await readySticker(jpeg, 'photo.jpg');
    expect(status).toBe('rejected');
    await auth(http().post(`/api/v1/servers/${serverId}/stickers`))
      .send({ attachmentId: id, name: 'jpeg' })
      .expect(400);
  });

  it('sends a sticker message with empty content and refuses content next to a sticker', async () => {
    const sent = await auth(http().post(`/api/v1/channels/${channelId}/messages`), member)
      .send({ content: '', nonce: randomUUID(), stickerId: firstStickerId })
      .expect(201);
    stickerMessageId = sent.body.id;
    expect(sent.body.kind).toBe('sticker');
    expect(sent.body.sticker).toMatchObject({ id: firstStickerId, name: 'tada', deleted: false });
    expect(sent.body.sticker.url).toContain('/file?');
    expect(sent.body.sticker.previewUrl).toContain('/file?');
    await auth(http().post(`/api/v1/channels/${channelId}/messages`), member)
      .send({ content: 'kèm chữ', nonce: randomUUID(), stickerId: firstStickerId })
      .expect(400);
  });

  it('hides a cross-server sticker behind a plain 400 while the system pack works everywhere', async () => {
    await auth(http().post(`/api/v1/channels/${channelB}/messages`), boss)
      .send({ content: '', nonce: randomUUID(), stickerId: firstStickerId })
      .expect(400);
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
    await auth(http().patch(`/api/v1/messages/${sent.body.id}`), member)
      .send({ content: 'edit' })
      .expect(400);
    const removed = await auth(http().delete(`/api/v1/messages/${sent.body.id}`), member).expect(
      200,
    );
    expect(removed.body).toEqual({ id: sent.body.id });
  });

  // Ca retry idempotent đứng TRƯỚC ca trần: ở trần 30/30 lượt tạo bị chặn ở bước đếm.
  it('retries idempotently: posting twice with the same attachmentId returns the original sticker', async () => {
    const again = await auth(http().post(`/api/v1/servers/${serverId}/stickers`))
      .send({ attachmentId: firstAttachmentId, name: 'tada' })
      .expect(201);
    expect(again.body.id).toBe(firstStickerId);
  });

  it(`caps a server at ${Limits.STICKERS_PER_SERVER} stickers and frees the slot after soft delete`, async () => {
    const pack = await db.stickerPack.findFirstOrThrow({ where: { serverId } });
    const current = await db.sticker.count({ where: { packId: pack.id, deletedAt: null } });
    for (let i = current; i < Limits.STICKERS_PER_SERVER - 1; i++)
      await seedSticker(`bulk-${runId}-${i}`, pack.id, serverId);
    const slot = await readySticker();
    const thirtieth = await auth(http().post(`/api/v1/servers/${serverId}/stickers`))
      .send({ attachmentId: slot.id, name: 'thirtieth' })
      .expect(201);
    const overflow = await readySticker();
    const denied = await auth(http().post(`/api/v1/servers/${serverId}/stickers`))
      .send({ attachmentId: overflow.id, name: 'one-too-many' })
      .expect(400);
    expect(denied.body.code).toBe(ErrorCodes.STICKER_LIMIT_REACHED);
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
    await auth(http().delete(`/api/v1/stickers/${firstStickerId}`), member).expect(403);
    const removed = await auth(http().delete(`/api/v1/stickers/${firstStickerId}`)).expect(200);
    expect(removed.body).toEqual({ id: firstStickerId });
    const list = await auth(http().get(`/api/v1/servers/${serverId}/stickers`)).expect(200);
    const pack = list.body.packs.find((p: { serverId: string | null }) => p.serverId === serverId);
    expect(pack.stickers.map((s: { id: string }) => s.id)).not.toContain(firstStickerId);
    const page = await auth(http().get(`/api/v1/channels/${channelId}/messages`)).expect(200);
    const old = page.body.messages.find((m: { id: string }) => m.id === stickerMessageId);
    expect(old.sticker).toMatchObject({
      id: firstStickerId,
      name: 'tada',
      deleted: true,
      url: null,
      previewUrl: null,
    });
    await auth(http().delete(`/api/v1/stickers/${firstStickerId}`)).expect(404);
    await auth(http().delete(`/api/v1/stickers/${systemStickerId}`)).expect(403);
  });

  it('writes a STICKER_DELETE audit row for the manager deletion above', async () => {
    const rows = await db.auditLog.findMany({
      where: { serverId, action: 'STICKER_DELETE', targetId: firstStickerId },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.actorId).toBe(ownerId);
  });
});
