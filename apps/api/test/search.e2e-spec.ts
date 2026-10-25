import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { randomUUID } from 'node:crypto';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { RedisProvider } from '../src/infra/redis/redis.module.js';

const runId = Date.now().toString(36);

interface TestUser {
  id: string;
  token: string;
}

/**
 * T4.6 (ADR-0045): tìm kiếm FTS + trigram trong server — khớp có dấu/không dấu, con chuỗi,
 * filter channel/author/since, cursor before, không lộ server khác, không trả tin đã xóa,
 * q rỗng/quá dài → 400 SEARCH_QUERY_INVALID. Dùng đúng 4 user (trần register 5/phút/IP).
 */
describe('Search (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const emails: string[] = [];

  let owner: TestUser;
  let otherMember: TestUser;
  let outsider: TestUser;
  let serverA: string;
  let serverB: string;
  let channelA1: string;
  let channelA2: string;
  let secretToken: string;

  const uniqueSuffix = () => Math.random().toString(36).slice(2, 8);

  async function registerUser(): Promise<TestUser> {
    const email = `s-${runId}-${uniqueSuffix()}@ping.dev`;
    const username = `s${runId}${uniqueSuffix()}`.slice(0, 32);
    emails.push(email);
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, username, password: 'password123', displayName: 'SR' })
      .expect(201);
    return { id: res.body.user.id, token: res.body.accessToken };
  }

  const api = (method: 'get' | 'post' | 'delete', url: string, token?: string) => {
    const agent = request(app.getHttpServer());
    const call = {
      get: () => agent.get(url),
      post: () => agent.post(url),
      delete: () => agent.delete(url),
    }[method]();
    return token ? call.set('Authorization', `Bearer ${token}`) : call;
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    await app.init();
    prisma = app.get(PrismaService);
    await app.get(RedisProvider).flushdb();

    owner = await registerUser();
    otherMember = await registerUser();
    outsider = await registerUser();
    // serverB của outsider — dùng cho test không lộ chéo server.
    const third = await registerUser();
    outsider = third;

    const a = await api('post', '/api/v1/servers', owner.token)
      .send({ name: 'Search A' })
      .expect(201);
    serverA = a.body.id;
    channelA1 = a.body.channels[0].id;
    const secondChannel = await api('post', `/api/v1/servers/${serverA}/channels`, owner.token)
      .send({ name: 'tailieu' })
      .expect(201);
    channelA2 = secondChannel.body.id;
    await api('post', '/api/v1/servers/join', otherMember.token)
      .send({ inviteCode: a.body.inviteCode })
      .expect(201);

    const b = await api('post', '/api/v1/servers', outsider.token)
      .send({ name: 'Search B' })
      .expect(201);
    serverB = b.body.id;

    // Từ khóa duy nhất per-run để không dính dữ liệu run khác.
    secretToken = `thư viện ${runId}`;
    const send = (token: string, channelId: string, content: string) =>
      api('post', `/api/v1/channels/${channelId}/messages`, token)
        .send({ content, nonce: randomUUID() })
        .expect(201);

    // owner: 3 tin chứa từ khóa (2 ở kênh 1, 1 ở kênh 2) + 1 tin không liên quan.
    await send(owner.token, channelA1, `Hôm nay mình khai trương ${secretToken} mới`);
    await send(owner.token, channelA1, `Ai cần sách thì qua ${secretToken} nhé`);
    const oldMessage = (await send(owner.token, channelA2, `Báo cáo ${secretToken} đã đủ đầu sách`))
      .body.id;
    await send(owner.token, channelA1, 'Tin không liên quan gì cả');
    // otherMember: 1 tin chứa từ khóa (đường FTS, tác giả khác).
    await send(otherMember.token, channelA1, `Mình thấy ${secretToken} ổn đấy`);
    // Tin chứa từ liền không dấu — chỉ khớp qua đường con chuỗi (trigram).
    await send(owner.token, channelA1, `bộ tài liệu tailieu${runId} riêng`);
    // Server B có tin chứa cùng từ khóa — KHÔNG được lọt vào kết quả của server A.
    await api('post', `/api/v1/channels/${b.body.channels[0].id}/messages`, outsider.token)
      .send({ content: `${secretToken} của server B`, nonce: randomUUID() })
      .expect(201);
    expect(oldMessage).toBeDefined();
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

  it('tìm có dấu (FTS) và không dấu (unaccent) đều ra đúng 4 tin của server A, không lọt server B', async () => {
    for (const q of [`thu vien ${runId}`, `THƯ VIỆN ${runId}`]) {
      const res = await api(
        'get',
        `/api/v1/servers/${serverA}/search?q=${encodeURIComponent(q)}`,
        owner.token,
      ).expect(200);
      expect(res.body.results).toHaveLength(4);
      expect(
        res.body.results.every((item: { content: string }) => !item.content.includes('server B')),
      ).toBe(true);
      expect(
        res.body.results.every(
          (item: { channelName: string }) =>
            item.channelName === 'general' || item.channelName === 'tailieu',
        ),
      ).toBe(true);
    }
    // Từ khóa liền không dấu khớp qua con chuỗi.
    const substringHit = await api(
      'get',
      `/api/v1/servers/${serverA}/search?q=${encodeURIComponent(`tailieu${runId}`)}`,
      owner.token,
    ).expect(200);
    expect(substringHit.body.results).toHaveLength(1);

    // Từ không tồn tại → rỗng, không lỗi.
    const none = await api(
      'get',
      `/api/v1/servers/${serverA}/search?q=khongtontai${runId}`,
      owner.token,
    ).expect(200);
    expect(none.body.results).toHaveLength(0);
  });

  it('con chuỗi TRONG từ (trigram) — FTS simple tách nguyên token nên không khớp được', async () => {
    // "ilie" nằm GIỮA từ "tailieu": token độc lập không tồn tại nên FTS trượt, chỉ ILIKE
    // trigram thấy (các tin khác chứa runId nhưng không chứa "tailieu").
    const res = await api(
      'get',
      `/api/v1/servers/${serverA}/search?q=${encodeURIComponent('ilie')}`,
      owner.token,
    ).expect(200);
    expect(res.body.results).toHaveLength(1);
    expect(res.body.results[0].content).toContain(`tailieu${runId}`);
  });

  it('lọc channelId/authorId và cursor before', async () => {
    const onlyCh2 = await api(
      'get',
      `/api/v1/servers/${serverA}/search?q=${secretToken}&channelId=${channelA2}`,
      owner.token,
    ).expect(200);
    expect(onlyCh2.body.results).toHaveLength(1);
    expect(onlyCh2.body.results[0].channelName).toBe('tailieu');

    const onlyOther = await api(
      'get',
      `/api/v1/servers/${serverA}/search?q=${secretToken}&authorId=${otherMember.id}`,
      owner.token,
    ).expect(200);
    expect(onlyOther.body.results).toHaveLength(1);
    expect(onlyOther.body.results[0].author.id).toBe(otherMember.id);

    // Phân trang cursor: limit 2 → 2 tin mới nhất, before = id cuối trang 1 → 2 tin kế tiếp.
    const page1 = await api(
      'get',
      `/api/v1/servers/${serverA}/search?q=${secretToken}&limit=2`,
      owner.token,
    ).expect(200);
    expect(page1.body.results).toHaveLength(2);
    expect(page1.body.hasMore).toBe(true);
    const page2 = await api(
      'get',
      `/api/v1/servers/${serverA}/search?q=${secretToken}&limit=2&before=${page1.body.results[1].id}`,
      owner.token,
    ).expect(200);
    expect(page2.body.results).toHaveLength(2);
    expect(page2.body.hasMore).toBe(false);
    // Toàn bộ 4 id phân biệt, không trùng.
    const ids = [...page1.body.results, ...page2.body.results].map((row: { id: string }) => row.id);
    expect(new Set(ids).size).toBe(4);
    // Thứ tự mới nhất trước: id trang 1 lớn hơn id trang 2.
    expect(page1.body.results[0].id > page2.body.results[0].id).toBe(true);
  });

  it('since lọc theo thời gian; tin xóa mềm không trả; IDOR outsider 403', async () => {
    // since ở tương lai → không còn kết quả.
    const future = await api(
      'get',
      `/api/v1/servers/${serverA}/search?q=${secretToken}&since=${new Date(Date.now() + 60_000).toISOString()}`,
      owner.token,
    ).expect(200);
    expect(future.body.results).toHaveLength(0);

    // Xóa mềm 1 tin chứa từ khóa → kết quả giảm 1.
    const target = await prisma.message.findFirstOrThrow({
      where: { channelId: channelA1, content: { contains: secretToken }, deletedAt: null },
      select: { id: true },
    });
    await api('delete', `/api/v1/messages/${target.id}`, owner.token).expect(200);
    const afterDelete = await api(
      'get',
      `/api/v1/servers/${serverA}/search?q=${secretToken}`,
      owner.token,
    ).expect(200);
    expect(afterDelete.body.results).toHaveLength(3);
    expect(afterDelete.body.results.map((row: { id: string }) => row.id)).not.toContain(target.id);

    // Người ngoài (chủ server B) gọi search trên server A → 403; server của mình vẫn 200.
    await api('get', `/api/v1/servers/${serverA}/search?q=${secretToken}`, outsider.token).expect(
      403,
    );
    await api('get', `/api/v1/servers/${serverB}/search?q=${secretToken}`, outsider.token).expect(
      200,
    );
  });

  it('q rỗng / quá dài / không truyền → 400 SEARCH_QUERY_INVALID', async () => {
    await api('get', `/api/v1/servers/${serverA}/search?q=`, owner.token)
      .expect(400)
      .expect((res) => expect(res.body.code).toBe('SEARCH_QUERY_INVALID'));
    await api('get', `/api/v1/servers/${serverA}/search?q=${'x'.repeat(201)}`, owner.token)
      .expect(400)
      .expect((res) => expect(res.body.code).toBe('SEARCH_QUERY_INVALID'));
    await api('get', `/api/v1/servers/${serverA}/search`, owner.token)
      .expect(400)
      .expect((res) => expect(res.body.code).toBe('SEARCH_QUERY_INVALID'));
  });
});
