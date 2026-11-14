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

const le24 = (n: number) => Buffer.from([n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff]);
const webpChunk = (type: string, data: Buffer) => {
  const head = Buffer.alloc(8);
  head.write(type, 0, 'ascii');
  head.writeUInt32LE(data.length, 4);
  return Buffer.concat([head, data, data.length % 2 ? Buffer.from([0]) : Buffer.alloc(0)]);
};

async function vp8lPayload(color: string): Promise<Buffer> {
  const file = await sharp({ create: { width: 64, height: 64, channels: 3, background: color } })
    .webp({ lossless: true })
    .toBuffer();
  const sub = file.subarray(12);
  const len = sub.readUInt32LE(4);
  return sub.subarray(8, 8 + len);
}

/** WebP động tự dựng (sharp không sinh được ảnh động từ đầu). */
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
  let token = '';
  let member = '';
  let outsider = '';
  let boss = '';
  let ownerId = '';
  let serverId = '';
  let channelId = '';
  let serverB = '';
  let firstEmojiId = '';
  let firstAttachmentId = '';
  let tokenMessageId = '';
  let deadEmojiId = '';
  let rivalEmojiId = '';
  let reactionMessageId = '';
  let png: Buffer;
  let png200: Buffer;
  const emails: string[] = [];
  const ids: string[] = [];
  const http = () => request(app.getHttpServer());
  const auth = (call: request.Test, bearer = token) =>
    call.set('Authorization', `Bearer ${bearer}`);

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
        rawRemoved: true,
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
    if (userIds.length) await db.server.deleteMany({ where: { ownerId: { in: userIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it('creates an emoji from a validated upload and lists it for the server', async () => {
    const { id } = await readyEmoji();
    firstAttachmentId = id;
    const created = await auth(http().post(`/api/v1/servers/${serverId}/emojis`))
      .send({ attachmentId: id, name: 'parrot' })
      .expect(201);
    firstEmojiId = created.body.id;
    expect(created.body).toMatchObject({ name: 'parrot', animated: false, width: 32, height: 32 });
    expect(created.body.url).toContain('/file?');
    expect(created.body.previewUrl).toContain('/file?');
    const list = await auth(http().get(`/api/v1/servers/${serverId}/emojis`)).expect(200);
    const found = list.body.emojis.find((e: { id: string }) => e.id === firstEmojiId);
    expect(found).toBeDefined();
    expect(found).toMatchObject({ name: 'parrot', animated: false });
    expect(found.url).toContain('/file?');
    expect(found.previewUrl).toContain('/file?');
  });

  it('lets a plain member view the list but not create emojis, and denies outsiders', async () => {
    await auth(http().post(`/api/v1/servers/${serverId}/emojis`), member)
      .send({ attachmentId: randomUUID(), name: 'nope' })
      .expect(403);
    const list = await auth(http().get(`/api/v1/servers/${serverId}/emojis`), member).expect(200);
    expect(Array.isArray(list.body.emojis)).toBe(true);
    await auth(http().get(`/api/v1/servers/${serverId}/emojis`), outsider).expect(403);
  });

  it('rejects a 200x200 static image at emoji validation and refuses to claim it', async () => {
    const { id, status } = await readyEmoji(png200, 'big.png');
    expect(status).toBe('rejected');
    await auth(http().post(`/api/v1/servers/${serverId}/emojis`))
      .send({ attachmentId: id, name: 'big' })
      .expect(400);
  });

  // Ca retry idempotent đứng TRƯỚC ca trần: ở trần 50/50 lượt tạo bị chặn ở bước đếm.
  it('retries idempotently: posting twice with the same attachmentId returns the original emoji', async () => {
    const again = await auth(http().post(`/api/v1/servers/${serverId}/emojis`))
      .send({ attachmentId: firstAttachmentId, name: 'parrot' })
      .expect(201);
    expect(again.body.id).toBe(firstEmojiId);
  });

  it(`caps a server at ${Limits.EMOJIS_STATIC_PER_SERVER} static emojis and frees the slot after soft delete`, async () => {
    const current = await db.customEmoji.count({
      where: { serverId, deletedAt: null, animated: false },
    });
    for (let i = current; i < Limits.EMOJIS_STATIC_PER_SERVER - 1; i++)
      await seedEmoji(`bulk${runId}${i}`, serverId);
    const slot = await readyEmoji();
    const fiftieth = await auth(http().post(`/api/v1/servers/${serverId}/emojis`))
      .send({ attachmentId: slot.id, name: 'fiftieth' })
      .expect(201);
    const overflow = await readyEmoji();
    const denied = await auth(http().post(`/api/v1/servers/${serverId}/emojis`))
      .send({ attachmentId: overflow.id, name: 'one_too_many' })
      .expect(400);
    expect(denied.body.code).toBe(ErrorCodes.EMOJI_LIMIT_REACHED);
    expect(denied.body.details).toEqual({ bucket: 'static' });
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
    const live = `xin chào :parrot:${firstEmojiId}`;
    const sent = await auth(http().post(`/api/v1/channels/${channelId}/messages`))
      .send({ content: live, nonce: randomUUID() })
      .expect(201);
    tokenMessageId = sent.body.id;
    expect(sent.body.content).toBe(live);
    await auth(http().post(`/api/v1/channels/${channelId}/messages`))
      .send({ content: `trộm :rival:${rivalEmojiId}`, nonce: randomUUID() })
      .expect(400);
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
    const liveToken = `c:${firstEmojiId}`;
    const added = await react(liveToken).expect(200);
    expect(added.body.reactions).toEqual([
      { emoji: liveToken, count: 1, me: true, emojiName: 'parrot' },
    ]);
    const page = await auth(http().get(`/api/v1/channels/${channelId}/messages`)).expect(200);
    const old = page.body.messages.find((m: { id: string }) => m.id === reactionMessageId);
    expect(old.reactions).toEqual([{ emoji: liveToken, count: 1, me: true, emojiName: 'parrot' }]);
    const cross = await react(`c:${rivalEmojiId}`).expect(400);
    expect(cross.body.code).toBe(ErrorCodes.REACTION_EMOJI_INVALID);
    const dead = await react(`c:${deadEmojiId}`).expect(400);
    expect(dead.body.code).toBe(ErrorCodes.REACTION_EMOJI_INVALID);
    await react('👍').expect(200);
    const removed = await auth(
      http().delete(
        `/api/v1/messages/${reactionMessageId}/reactions/${encodeURIComponent(liveToken)}`,
      ),
    ).expect(200);
    expect(removed.body.reactions).toEqual([{ emoji: '👍', count: 1, me: true }]);
  });

  it('deletes an emoji: member forbidden, manager succeeds, old messages keep the raw token', async () => {
    await auth(http().delete(`/api/v1/emojis/${firstEmojiId}`), member).expect(403);
    const orphan = await auth(http().post(`/api/v1/channels/${channelId}/messages`), member)
      .send({ content: 'cảm xúc mồ côi', nonce: randomUUID() })
      .expect(201);
    const orphanToken = `c:${firstEmojiId}`;
    const reactionUrl = (emoji: string) =>
      `/api/v1/messages/${orphan.body.id}/reactions/${encodeURIComponent(emoji)}`;
    await auth(http().put(reactionUrl(orphanToken))).expect(200);
    const removed = await auth(http().delete(`/api/v1/emojis/${firstEmojiId}`)).expect(200);
    expect(removed.body).toEqual({ id: firstEmojiId });
    const list = await auth(http().get(`/api/v1/servers/${serverId}/emojis`)).expect(200);
    expect(list.body.emojis.map((e: { id: string }) => e.id)).not.toContain(firstEmojiId);
    const page = await auth(http().get(`/api/v1/channels/${channelId}/messages`)).expect(200);
    const old = page.body.messages.find((m: { id: string }) => m.id === tokenMessageId);
    expect(old.content).toBe(`xin chào :parrot:${firstEmojiId}`);
    await auth(http().delete(`/api/v1/emojis/${firstEmojiId}`)).expect(404);

    const afterPage = await auth(http().get(`/api/v1/channels/${channelId}/messages`)).expect(200);
    const orphanRow = afterPage.body.messages.find((m: { id: string }) => m.id === orphan.body.id);
    expect(orphanRow.reactions).toEqual([
      { emoji: orphanToken, count: 1, me: true, emojiName: 'parrot' },
    ]);
    const readd = await auth(http().put(reactionUrl(orphanToken)), member).expect(400);
    expect(readd.body.code).toBe(ErrorCodes.REACTION_EMOJI_INVALID);
    const crossRemove = await auth(http().delete(reactionUrl(`c:${rivalEmojiId}`))).expect(400);
    expect(crossRemove.body.code).toBe(ErrorCodes.REACTION_EMOJI_INVALID);
    const ghostRemove = await auth(http().delete(reactionUrl(`c:${randomUUID()}`))).expect(400);
    expect(ghostRemove.body.code).toBe(ErrorCodes.REACTION_EMOJI_INVALID);
    const byMember = await auth(http().delete(reactionUrl(orphanToken)), member).expect(200);
    expect(byMember.body.reactions).toEqual([
      { emoji: orphanToken, count: 1, me: false, emojiName: 'parrot' },
    ]);
    const byOwner = await auth(http().delete(reactionUrl(orphanToken))).expect(200);
    expect(byOwner.body.reactions).toEqual([]);
  });

  it('writes an EMOJI_DELETE audit row for the manager deletion above', async () => {
    const rows = await db.auditLog.findMany({
      where: { serverId, action: 'EMOJI_DELETE', targetId: firstEmojiId },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.actorId).toBe(ownerId);
  });
});
