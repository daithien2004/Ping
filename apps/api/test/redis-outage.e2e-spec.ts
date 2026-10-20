import type { INestApplication } from '@nestjs/common';
import { ErrorCodes } from '@ping/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { bootApp } from './helpers/boot.js';

const runId = Date.now().toString(36);

/**
 * Chính sách khi Redis chết (ADR-0026): đọc/ghi dữ liệu vẫn chạy (fail-open), còn thao tác mà
 * Redis là nơi duy nhất bảo vệ (đăng nhập/đăng ký, Idempotency-Key) thì từ chối bằng 503.
 */
describe('Redis outage (e2e)', () => {
  let healthy: INestApplication;
  let down: INestApplication;
  const email = `outage-${runId}@ping.dev`;
  let token = '';
  let serverId = '';
  let channelId = '';
  let existingMessageId = '';

  const asUser = (method: 'get' | 'post' | 'patch' | 'delete', url: string) =>
    request(down.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);

  beforeAll(async () => {
    healthy = await bootApp();
    down = await bootApp({ deadRedis: true });

    // Chuẩn bị dữ liệu bằng instance khỏe; JWT là stateless nên instance "chết Redis" nhận được.
    const registered = await request(healthy.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, username: `out${runId}`.slice(0, 32), password: 'password123' })
      .expect(201);
    token = registered.body.accessToken as string;
    const server = await request(healthy.getHttpServer())
      .post('/api/v1/servers')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'outage' })
      .expect(201);
    serverId = server.body.id as string;
    const channels = await request(healthy.getHttpServer())
      .get(`/api/v1/servers/${serverId}/channels`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    channelId = (channels.body as Array<{ id: string }>)[0]!.id;
    const message = await request(healthy.getHttpServer())
      .post(`/api/v1/channels/${channelId}/messages`)
      .set('Authorization', `Bearer ${token}`)
      .send({ content: 'before the outage', nonce: randomUUID() })
      .expect(201);
    existingMessageId = message.body.id as string;
  });

  afterAll(async () => {
    const prisma = healthy.get(PrismaService);
    const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (user) {
      await prisma.message.deleteMany({ where: { authorId: user.id } });
      await prisma.server.deleteMany({ where: { ownerId: user.id } });
      await prisma.user.deleteMany({ where: { id: user.id } });
    }
    await Promise.all([healthy.close(), down.close()]);
  });

  async function timed<T>(run: () => Promise<T>): Promise<T> {
    const started = Date.now();
    const result = await run();
    // Không chờ hết timeout của từng lệnh Redis: instance biết Redis chưa sẵn sàng và bỏ qua ngay.
    expect(Date.now() - started).toBeLessThan(1500);
    return result;
  }

  it('reads keep working: the ability cache falls back to Postgres', async () => {
    const res = await timed(() => asUser('get', `/api/v1/channels/${channelId}/messages`));
    expect(res.status).toBe(200);
    expect(res.body.messages.map((m: { id: string }) => m.id)).toContain(existingMessageId);
  });

  it('sending, editing and deleting a message still work (saved in Postgres)', async () => {
    const nonce = randomUUID();
    const sent = await timed(() =>
      asUser('post', `/api/v1/channels/${channelId}/messages`).send({
        content: 'during the outage',
        nonce,
      }),
    );
    expect(sent.status).toBe(201);

    const edited = await asUser('patch', `/api/v1/messages/${sent.body.id}`).send({
      content: 'edited during the outage',
    });
    expect(edited.status).toBe(200);

    const removed = await asUser('delete', `/api/v1/messages/${sent.body.id}`);
    expect(removed.status).toBe(200);
  });

  it('a retry with the same nonce still returns the same message (dedupe lives in Postgres)', async () => {
    const nonce = randomUUID();
    const first = await asUser('post', `/api/v1/channels/${channelId}/messages`).send({
      content: 'once',
      nonce,
    });
    const second = await asUser('post', `/api/v1/channels/${channelId}/messages`).send({
      content: 'once',
      nonce,
    });
    expect([first.status, second.status]).toEqual([201, 201]);
    expect(second.body.id).toBe(first.body.id);
  });

  it('login is refused with 503 SERVICE_UNAVAILABLE and a requestId (fail-closed)', async () => {
    const res = await timed(() =>
      request(down.getHttpServer())
        .post('/api/v1/auth/login')
        .send({ email, password: 'password123' }),
    );
    expect(res.status).toBe(503);
    expect(res.body).toMatchObject({ code: ErrorCodes.SERVICE_UNAVAILABLE });
    expect(res.body.requestId).toBeTruthy();
    expect(res.headers['x-request-id']).toBe(res.body.requestId);
  });

  it('a create with Idempotency-Key is refused (503); without the header it still works', async () => {
    const keyed = await timed(() =>
      asUser('post', '/api/v1/servers')
        .set('Idempotency-Key', randomUUID())
        .send({ name: 'with key' }),
    );
    expect(keyed.status).toBe(503);
    expect(keyed.body.code).toBe(ErrorCodes.SERVICE_UNAVAILABLE);

    const plain = await asUser('post', '/api/v1/servers').send({ name: 'no key' });
    expect(plain.status).toBe(201);
  });
});
