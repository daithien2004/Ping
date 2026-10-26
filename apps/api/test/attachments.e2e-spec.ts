import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { bootApp } from './helpers/boot.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { MetricsService } from '../src/infra/metrics/metrics.service.js';
import { AttachmentWorker } from '../src/modules/attachments/attachment-worker.js';
import { LocalStorage } from '../src/modules/attachments/local-storage.js';
import type { Env } from '../src/config/env.schema.js';
import { RedisProvider } from '../src/infra/redis/redis.module.js';

describe('TG.6 attachments (real Postgres + disk)', () => {
  let app: INestApplication;
  let db: PrismaService;
  let worker: AttachmentWorker;
  let token = '';
  let outsider = '';
  let ownerId = '';
  let serverId = '';
  let channelId = '';
  let png: Buffer;
  const emails: string[] = [];
  const ids: string[] = [];
  const http = () => request(app.getHttpServer());
  const auth = (call: request.Test, bearer = token) =>
    call.set('Authorization', `Bearer ${bearer}`);
  async function start(bytes = png, filename = 'picture.png') {
    const nonce = randomUUID();
    const body = { channelId, filename, sizeBytes: bytes.length, nonce };
    const res = await auth(http().post('/api/v1/uploads')).send(body).expect(201);
    ids.push(res.body.id);
    return { id: res.body.id as string, body };
  }
  async function ready(bytes = png, filename = 'picture.png') {
    const { id } = await start(bytes, filename);
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
  beforeAll(async () => {
    app = await bootApp();
    db = app.get(PrismaService);
    worker = app.get(AttachmentWorker);
    await app.get(RedisProvider).flushdb();
    for (let i = 0; i < 2; i++) {
      const suffix = randomUUID().slice(0, 8);
      const email = `upload-${suffix}@ping.dev`;
      emails.push(email);
      const res = await http()
        .post('/api/v1/auth/register')
        .send({ email, username: `u${suffix}`, password: 'password123' })
        .expect(201);
      if (i === 0) {
        token = res.body.accessToken;
        ownerId = res.body.user.id;
      } else outsider = res.body.accessToken;
    }
    const server = await auth(http().post('/api/v1/servers'))
      .send({ name: 'Upload test', nonce: randomUUID() })
      .expect(201);
    serverId = server.body.id;
    const channels = await auth(http().get(`/api/v1/servers/${serverId}/channels`)).expect(200);
    channelId = channels.body[0].id;
    png = await sharp({ create: { width: 20, height: 12, channels: 3, background: 'red' } })
      .withMetadata()
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
  it('reserves once on retry; cannot complete before bytes, download pending, or access another user upload', async () => {
    const { id, body } = await start();
    expect((await auth(http().post('/api/v1/uploads')).send(body).expect(201)).body.id).toBe(id);
    await auth(http().post(`/api/v1/uploads/${id}/complete`)).expect(400);
    await auth(http().get(`/api/v1/attachments/${id}/download`)).expect(404);
    for (const method of ['get', 'delete'] as const)
      await auth(http()[method](`/api/v1/uploads/${id}`), outsider).expect(403);
    await auth(http().put(`/api/v1/uploads/${id}/content`), outsider)
      .set('Content-Type', 'application/octet-stream')
      .send(png)
      .expect(403);
    await auth(http().post('/api/v1/uploads'), outsider)
      .send({ ...body, nonce: randomUUID() })
      .expect(403);
    await auth(http().put(`/api/v1/uploads/${id}/content`))
      .set('Content-Type', 'application/octet-stream')
      .send(Buffer.alloc(png.length + 1))
      .expect(400);
  });
  it('processes image, sends attachment-only once, lists it, and denies forged/expired links', async () => {
    const { id, status } = await ready();
    expect(status).toBe('ready');
    const body = { content: '', nonce: randomUUID(), attachmentIds: [id] };
    const message = await auth(http().post(`/api/v1/channels/${channelId}/messages`))
      .send(body)
      .expect(201);
    expect(message.body.attachments[0]).toMatchObject({
      id,
      mime: 'image/webp',
      width: 20,
      height: 12,
    });
    expect(
      (
        await auth(http().post(`/api/v1/channels/${channelId}/messages`))
          .send(body)
          .expect(201)
      ).body.id,
    ).toBe(message.body.id);
    await auth(http().post(`/api/v1/channels/${channelId}/messages`))
      .send({ ...body, nonce: randomUUID() })
      .expect(400);
    const page = await auth(http().get(`/api/v1/channels/${channelId}/messages`)).expect(200);
    expect(
      page.body.messages.find((m: { id: string }) => m.id === message.body.id).attachments[0].id,
    ).toBe(id);
    const link = await auth(http().get(`/api/v1/attachments/${id}/download`)).expect(200);
    const file = await http().get(link.body.url).expect(200);
    expect(file.headers['content-type']).toContain('image/webp');
    expect(file.headers['cache-control']).toContain('no-store');
    expect((await sharp(file.body).metadata()).exif).toBeUndefined();
    await http().get(link.body.url.replace('signature=', 'signature=0')).expect(400);
    await http()
      .get(link.body.url.replace(/expires=\d+/, 'expires=1'))
      .expect(403);
    await auth(http().get(`/api/v1/attachments/${id}/download`), outsider).expect(403);
    await auth(http().delete(`/api/v1/messages/${message.body.id}`)).expect(200);
    await http().get(link.body.url).expect(404);
    for (
      let i = 0;
      i < 20 && (await db.attachment.findUniqueOrThrow({ where: { id } })).status !== 'deleted';
      i++
    )
      await worker.runOnce();
    expect((await db.attachment.findUniqueOrThrow({ where: { id } })).status).toBe('deleted');
    await expect(app.get(LocalStorage).read(`${id}.ready`)).rejects.toThrow();
  });
  it('rejects disguised active files in worker and never exposes their contents', async () => {
    for (const bytes of [
      Buffer.from('<svg onload="alert(1)"/>'),
      Buffer.from('%PDF-1.4\n/JavaScript xref\n%%EOF'),
    ]) {
      const { id, status } = await ready(bytes, 'fake.png');
      expect(status).toBe('rejected');
      await auth(http().get(`/api/v1/attachments/${id}/download`)).expect(404);
      await auth(http().post(`/api/v1/channels/${channelId}/messages`))
        .send({ content: 'bad', nonce: randomUUID(), attachmentIds: [id] })
        .expect(400);
    }
  });
  it('reserves quota atomically under concurrent requests', async () => {
    const config = app.get(ConfigService<Env, true>);
    const original = config.get('ATTACHMENT_USER_QUOTA_BYTES', { infer: true });
    const used = await db.attachment.aggregate({
      where: {
        uploaderId: ownerId,
        status: { in: ['pending', 'uploaded', 'queued', 'ready', 'deleting'] },
      },
      _sum: { quotaBytes: true },
    });
    config.set('ATTACHMENT_USER_QUOTA_BYTES', (used._sum.quotaBytes ?? 0) + 10 + 10 * 1024 * 1024);
    try {
      const results = await Promise.all(
        [1, 2].map(() =>
          auth(http().post('/api/v1/uploads')).send({
            channelId,
            filename: 'q.pdf',
            sizeBytes: 10,
            nonce: randomUUID(),
          }),
        ),
      );
      expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
      expect(results.find((r) => r.status === 400)?.body.code).toBe('UPLOAD_QUOTA_EXCEEDED');
      for (const res of results) if (res.status === 201) ids.push(res.body.id);
    } finally {
      config.set('ATTACHMENT_USER_QUOTA_BYTES', original);
    }
  });
  it('cleans abandoned pending uploads after one hour and cancellation is idempotent', async () => {
    const { id } = await start();
    await db.attachment.update({
      where: { id },
      data: { createdAt: new Date(Date.now() - 3_700_000) },
    });
    await worker.runOnce();
    expect((await db.attachment.findUniqueOrThrow({ where: { id } })).status).toBe('deleted');
    await auth(http().delete(`/api/v1/uploads/${id}`)).expect(200);
    await auth(http().delete(`/api/v1/uploads/${id}`)).expect(200);
  });

  it('retries storage failure without rejecting a valid file', async () => {
    const { id } = await start();
    await auth(http().put(`/api/v1/uploads/${id}/content`))
      .set('Content-Type', 'application/octet-stream')
      .send(png)
      .expect(200);
    await auth(http().post(`/api/v1/uploads/${id}/complete`)).expect(201);
    const storage = app.get(LocalStorage);
    // Drain earlier maintenance before failing the read of this queued file.
    for (let i = 0; i < 20; i++) {
      const earlier = await db.attachment.count({
        where: { id: { not: id }, status: { in: ['queued', 'deleting'] } },
      });
      if (!earlier) break;
      await worker.runOnce();
    }
    const read = vi.spyOn(storage, 'read').mockRejectedValueOnce(new Error('disk offline'));
    let failed = false;
    for (let i = 0; i < 20 && !failed; i++) {
      try {
        await worker.runOnce();
      } catch {
        failed = true;
      }
    }
    expect(failed).toBe(true);
    read.mockRestore();
    const pending = await db.attachment.findUniqueOrThrow({ where: { id } });
    expect(pending.status).toBe('queued');
    expect(pending.nextRetryAt.getTime()).toBeGreaterThan(Date.now());
    await db.attachment.update({ where: { id }, data: { nextRetryAt: new Date(0) } });
    for (
      let i = 0;
      i < 20 && (await db.attachment.findUniqueOrThrow({ where: { id } })).status !== 'ready';
      i++
    )
      await worker.runOnce();
    expect((await db.attachment.findUniqueOrThrow({ where: { id } })).status).toBe('ready');
  });

  it('PDF is always a download with nosniff; a cached member loses access immediately after leaving', async () => {
    const { id, status } = await ready(
      Buffer.from(
        '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\nxref\n0 1\n0000000000 65535 f\ntrailer\n<< /Root 1 0 R >>\nstartxref\n0\n%%EOF\n',
      ),
      'document.pdf',
    );
    expect(status).toBe('ready');
    await auth(http().post(`/api/v1/channels/${channelId}/messages`))
      .send({ content: 'PDF', nonce: randomUUID(), attachmentIds: [id] })
      .expect(201);
    const server = await db.server.findUniqueOrThrow({ where: { id: serverId } });
    await auth(http().post('/api/v1/servers/join'), outsider)
      .send({ inviteCode: server.inviteCode })
      .expect(201);
    const link = await auth(http().get(`/api/v1/attachments/${id}/download`), outsider).expect(200);
    const response = await http().get(link.body.url).expect(200);
    expect(response.headers['content-disposition']).toContain('attachment');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    await auth(http().post(`/api/v1/servers/${serverId}/leave`), outsider).expect(204);
    await http().get(link.body.url).expect(403);
  });

  it('exposes attachment metrics on the dedicated metrics port', async () => {
    const metrics = app.get(MetricsService);
    const port = await metrics.listen(0);
    const response = await fetch(`http://127.0.0.1:${port}/metrics`);
    expect(response.status).toBe(200);
    const body = await response.text();
    const counter = (outcome: string) =>
      Number(
        body.match(
          new RegExp(`^attachment_jobs_total\\{outcome="${outcome}"\\}\\s+(\\d+)`, 'm'),
        )?.[1] ?? 0,
      );
    // 1 ảnh + 1 PDF ready; 2 tệp giả rejected; xóa tin + dọn pending = ít nhất 2 deleted.
    expect(counter('ready')).toBeGreaterThanOrEqual(2);
    expect(counter('rejected')).toBe(2);
    expect(counter('deleted')).toBeGreaterThanOrEqual(2);
    expect(body).toMatch(/^dependency_up\{name="attachment_storage"\} 1$/m);
    // Máy chủ metrics được afterAll đóng qua onModuleDestroy của MetricsService.
  });
});
