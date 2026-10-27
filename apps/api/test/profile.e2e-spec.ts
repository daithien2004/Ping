import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bootApp } from './helpers/boot.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { AttachmentWorker } from '../src/modules/attachments/attachment-worker.js';
import { LocalStorage } from '../src/modules/attachments/local-storage.js';
import { RedisProvider } from '../src/infra/redis/redis.module.js';

describe('TG.7 profile (real Postgres + disk)', () => {
  let app: INestApplication;
  let db: PrismaService;
  let worker: AttachmentWorker;
  let token = '';
  let ownerId = '';
  let outsider = '';
  let serverId = '';
  let png: Buffer;
  const emails: string[] = [];
  const ids: string[] = [];
  const http = () => request(app.getHttpServer());
  const auth = (call: request.Test, bearer = token) =>
    call.set('Authorization', `Bearer ${bearer}`);

  /** Đưa một upload tới `ready` qua đúng pipeline TG.6 (reserve → PUT → complete → worker). */
  async function ready(
    bytes = png,
    filename = 'avatar.png',
    scope: 'avatar' | 'serverIcon' = 'avatar',
  ) {
    const res = await auth(http().post('/api/v1/uploads'))
      .send({
        scope,
        ...(scope === 'serverIcon' ? { serverId } : {}),
        filename,
        sizeBytes: bytes.length,
        nonce: randomUUID(),
      })
      .expect(201);
    ids.push(res.body.id);
    const id = res.body.id as string;
    await auth(http().put(`/api/v1/uploads/${id}/content`))
      .set('Content-Type', 'application/octet-stream')
      .send(bytes)
      .expect(200);
    await auth(http().post(`/api/v1/uploads/${id}/complete`)).expect(201);
    for (let i = 0; i < 20; i++) {
      await worker.runOnce();
      const row = await db.attachment.findUniqueOrThrow({ where: { id } });
      if (row.status === 'ready' || row.status === 'rejected') return { id, status: row.status };
    }
    throw new Error('Worker did not finish');
  }

  beforeAll(async () => {
    app = await bootApp();
    db = app.get(PrismaService);
    worker = app.get(AttachmentWorker);
    await app.get(RedisProvider).flushdb();
    for (let i = 0; i < 2; i++) {
      const suffix = randomUUID().slice(0, 8);
      const email = `profile-${suffix}@ping.dev`;
      emails.push(email);
      const res = await http()
        .post('/api/v1/auth/register')
        .send({ email, username: `p${suffix}`, password: 'password123' })
        .expect(201);
      if (i === 0) {
        token = res.body.accessToken;
        ownerId = res.body.user.id;
      } else outsider = res.body.accessToken;
    }
    const server = await auth(http().post('/api/v1/servers'))
      .send({ name: 'Profile test', nonce: randomUUID() })
      .expect(201);
    serverId = server.body.id;
    png = await sharp({ create: { width: 20, height: 12, channels: 3, background: 'blue' } })
      .png()
      .toBuffer();
  });

  afterAll(async () => {
    if (!db) return;
    const storage = app.get(LocalStorage);
    for (const id of ids)
      for (const suffix of ['raw', 'ready', 'thumb']) await storage.remove(`${id}.${suffix}`);
    await db.attachment.deleteMany({ where: { uploaderId: ownerId } });
    if (serverId) await db.server.deleteMany({ where: { id: serverId } });
    await db.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  it('binds a ready avatar to the profile; the URL serves without auth; rebinding is rejected', async () => {
    const { id } = await ready();
    const patched = await auth(http().patch('/api/v1/users/me'))
      .send({ avatarAttachmentId: id })
      .expect(200);
    expect(patched.body.avatarUrl).toContain(`/api/v1/attachments/${id}/file`);
    expect(patched.body.avatarUrl).toContain('thumbnail=1');
    // URL hồ sơ là bearer capability: <img> không mang token vẫn tải được ảnh đã reencode.
    const file = await http().get(patched.body.avatarUrl).expect(200);
    expect(file.headers['content-type']).toContain('image/webp');
    expect((await sharp(file.body).metadata()).exif).toBeUndefined();
    // Một tệp hồ sơ chỉ gắn một lần.
    await auth(http().patch('/api/v1/users/me'), outsider)
      .send({ avatarAttachmentId: id })
      .expect(400);
    await auth(http().patch('/api/v1/users/me')).send({ avatarAttachmentId: id }).expect(400);
  });

  it('replacing the avatar frees the old one through the worker', async () => {
    const first = await ready();
    await auth(http().patch('/api/v1/users/me')).send({ avatarAttachmentId: first.id }).expect(200);
    const second = await ready();
    const patched = await auth(http().patch('/api/v1/users/me'))
      .send({ avatarAttachmentId: second.id })
      .expect(200);
    expect(patched.body.avatarUrl).toContain(`/api/v1/attachments/${second.id}/file`);
    for (let i = 0; i < 20; i++) {
      await worker.runOnce();
      const row = await db.attachment.findUniqueOrThrow({ where: { id: first.id } });
      if (row.status === 'deleted') break;
    }
    expect((await db.attachment.findUniqueOrThrow({ where: { id: first.id } })).status).toBe(
      'deleted',
    );
    await http().get(patched.body.avatarUrl).expect(200);
  });

  it('rejects a disguised PDF avatar and a profile upload over the size cap', async () => {
    const { id, status } = await ready(
      Buffer.from('%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n'),
      'fake.png',
    );
    expect(status).toBe('rejected');
    expect(await db.attachment.findUniqueOrThrow({ where: { id } })).toMatchObject({
      scope: 'avatar',
    });
    await auth(http().post('/api/v1/uploads'))
      .send({
        scope: 'avatar',
        filename: 'big.png',
        sizeBytes: 5 * 1024 * 1024 + 1,
        nonce: randomUUID(),
      })
      .expect(400);
  });

  it('updates displayName and the nickname of the calling member only', async () => {
    const me = await auth(http().patch('/api/v1/users/me'))
      .send({ displayName: 'Quàng A' })
      .expect(200);
    expect(me.body.displayName).toBe('Quàng A');
    const nick = await auth(http().patch(`/api/v1/servers/${serverId}/members/me`))
      .send({ nickname: 'Quàng' })
      .expect(200);
    expect(nick.body.nickname).toBe('Quàng');
    await auth(http().patch(`/api/v1/servers/${serverId}/members/me`))
      .send({ nickname: null })
      .expect(200);
    // Người không thuộc server không tự đặt biệt danh được (IDOR có trong idor.e2e-spec).
    await auth(http().patch(`/api/v1/servers/${serverId}/members/me`), outsider)
      .send({ nickname: 'x' })
      .expect(403);
  });

  it('binds a server icon with manage permission and records the audit trail', async () => {
    const { id } = await ready(png, 'icon.png', 'serverIcon');
    const patched = await auth(http().patch(`/api/v1/servers/${serverId}`))
      .send({ iconAttachmentId: id })
      .expect(200);
    expect(patched.body.iconUrl).toContain(`/api/v1/attachments/${id}/file`);
    await http().get(patched.body.iconUrl).expect(200);
    const audit = await auth(http().get(`/api/v1/servers/${serverId}/audit-log`)).expect(200);
    expect(
      audit.body.entries.some(
        (entry: { action: string; metadata: Record<string, unknown> }) =>
          entry.action === 'SERVER_UPDATE' && entry.metadata.iconChanged === true,
      ),
    ).toBe(true);
    // Thành viên thường không có `update Server` → không gắn icon được.
    await auth(http().post('/api/v1/uploads'), outsider)
      .send({
        scope: 'serverIcon',
        serverId,
        filename: 'i.png',
        sizeBytes: 10,
        nonce: randomUUID(),
      })
      .expect(403);
  });
});
