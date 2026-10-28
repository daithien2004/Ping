import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test } from '@nestjs/testing';
import { ErrorCodes, type GifDto } from '@ping/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { bootApp } from './helpers/boot.js';
import { configureApp } from '../src/app.setup.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { RedisProvider } from '../src/infra/redis/redis.module.js';
import type { GifProvider } from '../src/modules/gifs/gif-provider.port.js';
import { GIF_PROVIDER } from '../src/modules/gifs/gif.tokens.js';

// Không phụ thuộc .env của máy: ép thiếu key cho cả file. App còn lại override GIF_PROVIDER
// bằng fake nên key không liên quan — adapter thật không bao giờ được gọi, không gọi mạng thật.
process.env.TENOR_API_KEY = '';

/** GIF "từ provider" — URL thuộc host allowlist nên gửi tin được. */
const fakeGif: GifDto = {
  id: 'tenor-1',
  url: 'https://media.tenor.com/abc/AAAAC/hello.gif',
  width: 498,
  height: 278,
  provider: 'tenor',
};

/** Provider giả đếm số lần gọi — dùng kiểm cache của service. */
class FakeGifProvider implements GifProvider {
  searchCalls = 0;
  trendingCalls = 0;

  async search(): Promise<GifDto[]> {
    this.searchCalls += 1;
    return [fakeGif];
  }

  async trending(): Promise<GifDto[]> {
    this.trendingCalls += 1;
    return [fakeGif];
  }
}

const http = (app: INestApplication) => request(app.getHttpServer());
const auth = (call: request.Test, bearer: string) => call.set('Authorization', `Bearer ${bearer}`);

/**
 * TG.25 GIF (ADR-0069): API cổng GIF + tin kind='gif'. Không cần worker (GIF không tải tệp).
 * Hai app: một thiếu TENOR_API_KEY (suy giảm 503), một override GIF_PROVIDER bằng fake
 * (pattern ask.e2e-spec) để kiểm search/trending, cache, gửi tin và rate limit.
 */
describe('TG.25 gifs (e2e)', () => {
  describe('thiếu TENOR_API_KEY — suy giảm 503, không gọi mạng', () => {
    let app: INestApplication;
    let token = '';
    const emails: string[] = [];

    beforeAll(async () => {
      app = await bootApp();
      await app.get(RedisProvider).flushdb();
      const email = `gif-nokey-${randomUUID().slice(0, 8)}@ping.dev`;
      const res = await http(app)
        .post('/api/v1/auth/register')
        .send({
          email,
          username: `gnk${randomUUID().slice(0, 8)}`,
          password: 'password123',
        })
        .expect(201);
      emails.push(email);
      token = res.body.accessToken;
    });

    afterAll(async () => {
      if (!app) return;
      const db = app.get(PrismaService);
      await db.user.deleteMany({ where: { email: { in: emails } } });
      await app.close();
    });

    it('/gifs/search và /gifs/trending trả 503 GIF_PROVIDER_UNAVAILABLE', async () => {
      const search = await auth(http(app).get('/api/v1/gifs/search?q=meo'), token).expect(503);
      expect(search.body.code).toBe(ErrorCodes.GIF_PROVIDER_UNAVAILABLE);
      const trending = await auth(http(app).get('/api/v1/gifs/trending'), token).expect(503);
      expect(trending.body.code).toBe(ErrorCodes.GIF_PROVIDER_UNAVAILABLE);
    });
  });

  describe('GIF provider giả — picker, gửi tin kind=gif, rate limit', () => {
    let app: NestExpressApplication;
    let db: PrismaService;
    let provider: FakeGifProvider;
    let owner = ''; // chủ server (ghim được tin)
    let member = ''; // member thường (gửi tin, thả cảm xúc)
    let serverId = '';
    let channelId = '';
    let gifMessageId = '';
    let replyMessageId = '';
    const emails: string[] = [];

    const register = async (label: string) => {
      const email = `gif-${label}-${randomUUID().slice(0, 8)}@ping.dev`;
      const res = await http(app)
        .post('/api/v1/auth/register')
        .send({
          email,
          username: `gif${label}${randomUUID().slice(0, 6)}`,
          password: 'password123',
        })
        .expect(201);
      emails.push(email);
      return { id: res.body.user.id as string, token: res.body.accessToken as string };
    };

    beforeAll(async () => {
      provider = new FakeGifProvider();
      const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(GIF_PROVIDER)
        .useValue(provider)
        .compile();
      app = moduleRef.createNestApplication<NestExpressApplication>();
      configureApp(app);
      await app.init();
      db = app.get(PrismaService);
      await app.get(RedisProvider).flushdb();

      const ownerUser = await register('owner');
      owner = ownerUser.token;
      const memberUser = await register('member');
      member = memberUser.token;
      const server = await auth(http(app).post('/api/v1/servers'), owner)
        .send({ name: 'Gif test', nonce: randomUUID() })
        .expect(201);
      serverId = server.body.id;
      channelId = server.body.channels[0].id;
      await auth(http(app).post('/api/v1/servers/join'), member)
        .send({ inviteCode: server.body.inviteCode })
        .expect(201);
    });

    afterAll(async () => {
      if (!app) return;
      const users = await db.user.findMany({
        where: { email: { in: emails } },
        select: { id: true },
      });
      const userIds = users.map((user) => user.id);
      // AuditLog/OutboxEvent không có FK → dọn tay; server cascade channel/message/reaction.
      const touched = [gifMessageId, replyMessageId].filter((id) => id !== '');
      if (touched.length)
        await db.outboxEvent.deleteMany({ where: { aggregateId: { in: touched } } });
      if (serverId) await db.auditLog.deleteMany({ where: { serverId } });
      if (userIds.length) await db.server.deleteMany({ where: { ownerId: { in: userIds } } });
      await db.user.deleteMany({ where: { id: { in: userIds } } });
      await app.close();
    });

    it('search/trending trả GifDto qua provider; cache giúp provider chỉ bị gọi một lần', async () => {
      const first = await auth(http(app).get('/api/v1/gifs/search?q=meo'), owner).expect(200);
      expect(first.body.gifs).toEqual([fakeGif]);
      const second = await auth(http(app).get('/api/v1/gifs/search?q=meo'), member).expect(200);
      expect(second.body.gifs).toEqual([fakeGif]);
      expect(provider.searchCalls).toBe(1); // hai lần gọi, provider chỉ chạm một lần

      const trending = await auth(http(app).get('/api/v1/gifs/trending'), member).expect(200);
      expect(trending.body.gifs).toEqual([fakeGif]);
      expect(provider.trendingCalls).toBe(1);
    });

    it('tham số sai hình thức bị 400: thiếu q, q chỉ trắng, q quá 64 ký tự', async () => {
      await auth(http(app).get('/api/v1/gifs/search'), owner).expect(400);
      await auth(http(app).get('/api/v1/gifs/search?q=%20%20'), owner).expect(400);
      await auth(http(app).get(`/api/v1/gifs/search?q=${'x'.repeat(65)}`), owner).expect(400);
    });

    it('gửi tin gif: 201, kind=gif kèm preview, nonce trùng trả lại tin cũ', async () => {
      const nonce = randomUUID();
      const gif = {
        id: fakeGif.id,
        url: fakeGif.url,
        width: fakeGif.width,
        height: fakeGif.height,
      };
      const sent = await auth(http(app).post(`/api/v1/channels/${channelId}/messages`), member)
        .send({ content: '', nonce, gif })
        .expect(201);
      gifMessageId = sent.body.id;
      expect(sent.body.kind).toBe('gif');
      expect(sent.body.content).toBe('');
      expect(sent.body.gif).toEqual({
        url: fakeGif.url,
        width: fakeGif.width,
        height: fakeGif.height,
        provider: 'tenor',
      });

      // Retry cùng nonce → đúng tin cũ, không tạo trùng (pattern sticker).
      const retry = await auth(http(app).post(`/api/v1/channels/${channelId}/messages`), member)
        .send({ content: '', nonce, gif })
        .expect(201);
      expect(retry.body.id).toBe(gifMessageId);

      // List: tin GIF về đúng hình dạng DTO.
      const list = await auth(
        http(app).get(`/api/v1/channels/${channelId}/messages`),
        member,
      ).expect(200);
      const row = list.body.messages.find((m: { id: string }) => m.id === gifMessageId);
      expect(row.kind).toBe('gif');
      expect(row.gif).toEqual({
        url: fakeGif.url,
        width: fakeGif.width,
        height: fakeGif.height,
        provider: 'tenor',
      });

      // Event message.created (payload outbox — nguồn của relay realtime) mang kind + preview.
      const event = await db.outboxEvent.findFirstOrThrow({
        where: { aggregateId: gifMessageId, type: 'message.created' },
      });
      const payload = event.payload as { kind?: string; gif?: { url: string; provider: string } };
      expect(payload.kind).toBe('gif');
      expect(payload.gif).toMatchObject({ url: fakeGif.url, provider: 'tenor' });
    });

    it('gửi URL host lạ → 400 (schema allowlist)', async () => {
      await auth(http(app).post(`/api/v1/channels/${channelId}/messages`), member)
        .send({
          content: '',
          nonce: randomUUID(),
          gif: {
            id: 'x',
            url: 'https://media.giphy.com/abc/AAAAC/nope.gif',
            width: 100,
            height: 100,
          },
        })
        .expect(400);
    });

    it('gửi GIF kèm nội dung → 400', async () => {
      await auth(http(app).post(`/api/v1/channels/${channelId}/messages`), member)
        .send({
          content: 'kèm chữ',
          nonce: randomUUID(),
          gif: { id: fakeGif.id, url: fakeGif.url, width: fakeGif.width, height: fakeGif.height },
        })
        .expect(400);
    });

    it('sửa tin GIF bị chặn 400', async () => {
      await auth(http(app).patch(`/api/v1/messages/${gifMessageId}`), member)
        .send({ content: 'edit' })
        .expect(400);
    });

    it(`chặn lượt thứ 31 trong một phút (${30 + 1} req) bằng 429`, async () => {
      // Reset cả rate limit GIF lẫn throttler toàn cục/IP để ca này tất định.
      await app.get(RedisProvider).flushdb();
      for (let i = 0; i < 30; i++) {
        await auth(http(app).get('/api/v1/gifs/search?q=flood'), owner).expect(200);
      }
      const blocked = await auth(http(app).get('/api/v1/gifs/search?q=flood'), owner).expect(429);
      expect(blocked.body.code).toBe(ErrorCodes.TOO_MANY_REQUESTS);
      // User khác có cửa sổ riêng — không bị kẹt theo.
      await auth(http(app).get('/api/v1/gifs/search?q=flood'), member).expect(200);
    });

    it('reaction, reply và pin trên tin GIF hoạt động như tin thường', async () => {
      // Cảm xúc: member thả 👍 — tổng hợp count/me như tin văn bản.
      const reacted = await auth(
        http(app).put(`/api/v1/messages/${gifMessageId}/reactions/${encodeURIComponent('👍')}`),
        member,
      ).expect(200);
      expect(reacted.body.reactions).toEqual([{ emoji: '👍', count: 1, me: true }]);

      // Reply tới tin GIF: preview trích nội dung rỗng (giống tin sticker — TG.1).
      const reply = await auth(http(app).post(`/api/v1/channels/${channelId}/messages`), member)
        .send({ content: 'đùa quá', nonce: randomUUID(), replyToId: gifMessageId })
        .expect(201);
      replyMessageId = reply.body.id;
      expect(reply.body.replyTo).toMatchObject({ id: gifMessageId, content: '', deleted: false });

      // Ghim: owner có MANAGE_MESSAGES; danh sách ghim trả đủ preview GIF.
      const pinned = await auth(
        http(app).put(`/api/v1/messages/${gifMessageId}/pin`),
        owner,
      ).expect(200);
      expect(pinned.body.messageId).toBe(gifMessageId);
      const pins = await auth(http(app).get(`/api/v1/channels/${channelId}/pins`), owner).expect(
        200,
      );
      const pinRow = pins.body.find(
        (entry: { message: { id: string } }) => entry.message.id === gifMessageId,
      );
      expect(pinRow.message.kind).toBe('gif');
      expect(pinRow.message.gif).toMatchObject({ url: fakeGif.url, provider: 'tenor' });

      // Dọn reply để afterAll chỉ cần xóa theo user.
      await auth(http(app).delete(`/api/v1/messages/${reply.body.id}`), member).expect(200);
    });
  });
});
