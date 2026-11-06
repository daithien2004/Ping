import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { RedisProvider } from '../src/infra/redis/redis.module.js';
import { bootApp } from './helpers/boot.js';

/**
 * ADR-0080: rate limit chia bucket theo nhóm route, khoá theo người dùng đã xác thực (IP cho
 * route chưa xác thực), khóa 2–10 giây thay vì 60 giây.
 *
 * Mỗi ca dùng user mới và `flushdb` trước khi chạy: bộ đếm là cửa sổ cố định trên Redis thật, dùng
 * lại user/window của ca trước sẽ làm kết quả phụ thuộc thứ tự.
 */
const runId = Date.now().toString(36);
const PASSWORD = 'password123';

describe('rate limit buckets (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let redis: RedisProvider;
  const emails: string[] = [];

  const http = () => request(app.getHttpServer());
  const api = (path: string) => `/api/v1${path}`;
  const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function registerUser(label: string): Promise<{ id: string; token: string }> {
    const email = `bucket-${label}-${runId}@ping.dev`;
    emails.push(email);
    const res = await http()
      .post(api('/auth/register'))
      .send({ email, username: `bk${label}${runId}`.slice(0, 32), password: PASSWORD })
      .expect(201);
    return { id: res.body.user.id as string, token: res.body.accessToken as string };
  }

  async function createServer(
    token: string,
    name: string,
  ): Promise<{ id: string; channelId: string }> {
    const res = await http().post(api('/servers')).set(bearer(token)).send({ name }).expect(201);
    return { id: res.body.id as string, channelId: res.body.channels[0].id as string };
  }

  beforeAll(async () => {
    app = await bootApp();
    prisma = app.get(PrismaService);
    redis = app.get(RedisProvider);
  });

  beforeEach(async () => {
    await redis.flushdb();
  });

  afterAll(async () => {
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

  it('read-light: 60 GET /users/me/unread stay under the 240/min bucket (no 429)', async () => {
    const user = await registerUser('read');

    const statuses: number[] = [];
    for (let count = 0; count < 60; count += 1) {
      const res = await http().get(api('/users/me/unread')).set(bearer(user.token));
      statuses.push(res.status);
    }
    expect(statuses.filter((status) => status === 429)).toHaveLength(0);
    expect(statuses.every((status) => status === 200)).toBe(true);
  });

  it('search: exhausting the 40/min search bucket leaves unread and permissions untouched', async () => {
    const user = await registerUser('search');
    const server = await createServer(user.token, 'search bucket');

    // Handler override thắng bucket mức class: RolesController khai writeStructure ở class nhưng
    // GET danh sách role là readLight (240/phút).
    const roles = await http()
      .get(api(`/servers/${server.id}/roles`))
      .set(bearer(user.token))
      .expect(200);
    expect(roles.headers['x-ratelimit-limit']).toBe('240');

    const responses = [];
    for (let count = 0; count < 45; count += 1) {
      const res = await http()
        .get(api(`/servers/${server.id}/search`))
        .query({ q: `hello-${count}` })
        .set(bearer(user.token));
      responses.push(res);
    }

    const blocked = responses.filter((res) => res.status === 429);
    expect(blocked.length).toBeGreaterThan(0);
    // 429 đầu tiên đến từ SearchRateLimiter trong service (30/phút, cửa sổ 60 giây) nên
    // Retry-After của nó dài. Sau khi vượt 40 request, guard chặn cả bucket route: 429 cuối kèm
    // `X-RateLimit-Limit` của bucket và Retry-After không vượt blockDuration (10 giây).
    const last = responses.at(-1);
    expect(last?.status).toBe(429);
    expect(last?.headers['x-ratelimit-limit']).toBe('40');
    expect(last?.headers['x-ratelimit-remaining']).toBe('0');
    const retryAfter = Number(last?.headers['retry-after']);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBeLessThanOrEqual(10);

    // Bucket khác của cùng người dùng không bị ảnh hưởng.
    await http().get(api('/users/me/unread')).set(bearer(user.token)).expect(200);
    await http()
      .get(api(`/servers/${server.id}/me/permissions`))
      .set(bearer(user.token))
      .expect(200);
  });

  it('keys authenticated buckets by user, not by the shared IP: a second user is not throttled', async () => {
    const first = await registerUser('peruser-a');
    const second = await registerUser('peruser-b');
    const patch = (token: string) =>
      http().patch(api('/users/me/settings')).set(bearer(token)).send({ theme: 'dark' });

    // write-structure: 20/phút cho mỗi user; cùng IP 127.0.0.1 nhưng hai bộ đếm riêng.
    const statuses: number[] = [];
    for (let count = 0; count < 20; count += 1) {
      statuses.push((await patch(first.token)).status);
    }
    expect(statuses.every((status) => status === 200)).toBe(true);

    const blocked = await patch(first.token);
    expect(blocked.status).toBe(429);
    expect(blocked.headers['x-ratelimit-limit']).toBe('20');
    expect(Number(blocked.headers['retry-after'])).toBeLessThanOrEqual(10);

    await patch(second.token).expect(200);
  });

  it('/health stays out of the throttler: 100 hits in a row are all 200', async () => {
    for (let count = 0; count < 100; count += 1) {
      await http().get(api('/health')).expect(200);
    }
  });

  it('acceptance: 10 concurrent message sends do not lock the read buckets', async () => {
    const user = await registerUser('burst');
    const server = await createServer(user.token, 'burst');

    const sends = Array.from({ length: 10 }, () =>
      http()
        .post(api(`/channels/${server.channelId}/messages`))
        .set(bearer(user.token))
        .send({ content: 'burst', nonce: randomUUID() }),
    );
    // Đọc nhẹ chạy xen trong lúc burst ghi: nếu bucket dùng chung thì chúng sẽ ăn 429 theo.
    const reads = Array.from({ length: 10 }, (_unused, index) =>
      index % 2 === 0
        ? http().get(api('/users/me/unread')).set(bearer(user.token))
        : http()
            .get(api(`/servers/${server.id}/me/permissions`))
            .set(bearer(user.token)),
    );

    const [sendResults, readResults] = await Promise.all([Promise.all(sends), Promise.all(reads)]);

    const sendBlocked = sendResults.filter((res) => res.status === 429);
    // Đo trên máy dev 2026-11-06: 10/10 tin trả 201, 0×429 (service limiter 10 tin/10 giây vừa
    // đủ). Giữ ngưỡng ≤ 1 theo yêu cầu nghiệm thu để không đỏ vì một lần đếm lệch.
    expect(sendBlocked.length).toBeLessThanOrEqual(1);
    for (const res of sendBlocked) {
      expect(Number(res.headers['retry-after'])).toBeLessThanOrEqual(10);
    }
    expect(sendResults.filter((res) => res.status === 201).length).toBeGreaterThanOrEqual(9);

    expect(readResults.filter((res) => res.status === 429)).toHaveLength(0);
    expect(readResults.every((res) => res.status === 200)).toBe(true);
  });
});
