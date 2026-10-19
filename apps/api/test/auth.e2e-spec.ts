import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { createHash } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { RedisProvider } from '../src/infra/redis/redis.module.js';
import { REFRESH_COOKIE_NAME } from '../src/modules/auth/auth.constants.js';

// Mỗi run một suffix khác nhau để chạy lại test không đụng unique constraint
// với dữ liệu của run trước (cleanup có afterAll nhưng phòng khi run bị kill giữa chừng).
const runId = Date.now().toString(36);

/** Lấy đúng cặp `name=value` từ header Set-Cookie, bỏ hết attribute. */
function refreshCookieOf(setCookie: string[] | string | undefined): string {
  const header = cookieHeaderLines(setCookie).find((cookie) =>
    cookie.startsWith(`${REFRESH_COOKIE_NAME}=`),
  );
  if (!header) {
    throw new Error('Set-Cookie did not include the refresh cookie');
  }
  const [nameValue] = header.split(';');
  if (!nameValue) {
    throw new Error('Malformed Set-Cookie header');
  }
  return nameValue;
}

/** SHA-256 của giá trị cookie — đúng cách API lưu refresh token trong bảng Session. */
function tokenHashOf(cookie: string): string {
  return createHash('sha256')
    .update(cookie.slice(cookie.indexOf('=') + 1))
    .digest('hex');
}

/** Kiểu supertest khai báo set-cookie là string, runtime Express trả string[]. */
function cookieHeaderLines(setCookie: string[] | string | undefined): string[] {
  if (!setCookie) {
    return [];
  }
  return Array.isArray(setCookie) ? setCookie : [setCookie];
}

describe('Auth (e2e)', () => {
  let app: INestApplication;
  const emails: string[] = [];

  const uniqueSuffix = () => Math.random().toString(36).slice(2, 8);

  function trackUser() {
    const email = `t-${runId}-${uniqueSuffix()}@ping.dev`;
    const username = `t${runId}${uniqueSuffix()}`.slice(0, 32);
    emails.push(email);
    return { email, username };
  }

  // KHÔNG async: helper phải trả về Test object của supertest để .expect() chain được.
  function register(email: string, username: string) {
    return request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, username, password: 'password123', displayName: 'E2E Tester' });
  }

  function login(email: string, password: string) {
    return request(app.getHttpServer()).post('/api/v1/auth/login').send({ email, password });
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    // main.ts chạy cookie-parser nhưng main.ts không chạy trong test —
    // e2e phải tự lắp lại middleware, thiếu nó req.cookies sẽ là undefined.
    app.use(cookieParser());
    // Tương tự global prefix: main.ts set, test thì không.
    app.setGlobalPrefix('api/v1');
    await app.init();

    // Redis là bộ đếm rate limit thật, còn sống qua các run — xóa để test
    // không dính phần còn lại của cửa sổ 60s từ run trước.
    const redis = moduleRef.get(RedisProvider);
    await redis.flushdb();
  });

  afterAll(async () => {
    const prisma = app.get(PrismaService);
    // Session cascade theo user; user e2e không sở hữu server/tin nhắn nên xóa sạch được.
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
  });

  it('POST /auth/register — tạo user, trả access token, set cookie httpOnly, không lộ passwordHash', async () => {
    const { email, username } = trackUser();

    const res = await register(email, username).expect(201);

    expect(res.body.user).toMatchObject({ email, username });
    expect(res.body.user.passwordHash).toBeUndefined();
    expect(typeof res.body.accessToken).toBe('string');
    expect(refreshCookieOf(res.headers['set-cookie']).startsWith(`${REFRESH_COOKIE_NAME}=`)).toBe(
      true,
    );
    expect(cookieHeaderLines(res.headers['set-cookie']).join(' ')).toContain('HttpOnly');
  });

  it('POST /auth/login — sai mật khẩu và email không tồn tại đều 401 cùng một message', async () => {
    const { email, username } = trackUser();
    await register(email, username).expect(201);

    const wrongPassword = await login(email, 'sai-mat-khau-9999').expect(401);
    const unknownEmail = await login(
      `t-${runId}-${uniqueSuffix()}@nope.dev`,
      'whatever-1234',
    ).expect(401);
    // Không tiết lộ email có tồn tại: cùng code, cùng message.
    expect(wrongPassword.body.code).toBe('UNAUTHORIZED');
    expect(unknownEmail.body.message).toBe(wrongPassword.body.message);

    const ok = await login(email, 'password123').expect(200);
    expect(ok.body.user).toMatchObject({ email });
    expect(typeof ok.body.accessToken).toBe('string');

    const me = await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', `Bearer ${ok.body.accessToken}`)
      .expect(200);
    expect(me.body).toMatchObject({ email, username });
    expect(me.body.passwordHash).toBeUndefined();
  });

  it('GET /users/me — 401 khi thiếu hoặc sai access token', async () => {
    await request(app.getHttpServer()).get('/api/v1/users/me').expect(401);
    await request(app.getHttpServer())
      .get('/api/v1/users/me')
      .set('Authorization', 'Bearer khong-phai-jwt')
      .expect(401);
  });

  it('POST /auth/refresh — xoay vòng token; dùng lại token cũ bị coi là đánh cắp → revoke toàn bộ session', async () => {
    const { email, username } = trackUser();
    await register(email, username).expect(201);
    const loginRes = await login(email, 'password123').expect(200);
    const cookie1 = refreshCookieOf(loginRes.headers['set-cookie']);

    // Rotation: response mang cookie mới, khác hẳn cookie cũ.
    const rotated = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookie1)
      .expect(200);
    const cookie2 = refreshCookieOf(rotated.headers['set-cookie']);
    expect(cookie2).not.toBe(cookie1);
    expect(typeof rotated.body.accessToken).toBe('string');

    // Dùng lại token cũ SAU cửa sổ ân hạn (lâu hơn một cú refresh đồng thời) mới là đánh cắp.
    await app.get(PrismaService).session.updateMany({
      where: { refreshTokenHash: tokenHashOf(cookie1) },
      data: { revokedAt: new Date(Date.now() - 60_000) },
    });

    // Reuse: đưa lại cookie đã bị xoay vòng → 401...
    const reused = await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookie1)
      .expect(401);
    expect(reused.body.code).toBe('UNAUTHORIZED');

    // ...và session MỚI cũng chết theo policy revoke-all.
    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookie2)
      .expect(401);
  });

  it('email không phân biệt hoa/thường; hai refresh đồng thời không đăng xuất user', async () => {
    const { email, username } = trackUser();
    const mixedCase = `  ${email.toUpperCase()} `;

    const registered = await register(mixedCase, username).expect(201);
    expect(registered.body.user.email).toBe(email);
    const loginRes = await login(email, 'password123').expect(200);
    const cookie1 = refreshCookieOf(loginRes.headers['set-cookie']);

    // Hai tab cùng hết hạn access token và cùng refresh bằng một cookie.
    const refresh = (cookie: string) =>
      request(app.getHttpServer()).post('/api/v1/auth/refresh').set('Cookie', cookie);
    const results = await Promise.all([refresh(cookie1), refresh(cookie1)]);
    expect(results.map((res) => res.status).sort()).toEqual([200, 401]);

    // Bên thắng giữ được phiên: không bị coi là token bị đánh cắp.
    const winner = results.find((res) => res.status === 200);
    const cookie2 = refreshCookieOf(winner?.headers['set-cookie']);
    await refresh(cookie2).expect(200);
  });

  it('POST /auth/logout — 204, xóa cookie, session hết hiệu lực', async () => {
    const { email, username } = trackUser();
    await register(email, username).expect(201);
    const loginRes = await login(email, 'password123').expect(200);
    const cookie = refreshCookieOf(loginRes.headers['set-cookie']);

    const logoutRes = await request(app.getHttpServer())
      .post('/api/v1/auth/logout')
      .set('Cookie', cookie)
      .expect(204);
    expect(cookieHeaderLines(logoutRes.headers['set-cookie']).join(' ')).toContain(
      REFRESH_COOKIE_NAME,
    );

    await request(app.getHttpServer())
      .post('/api/v1/auth/refresh')
      .set('Cookie', cookie)
      .expect(401);
  });

  // LUÔN để cuối: hammer login dùng chung cửa sổ đếm 60s với các login của test trên.
  it('rate limit login — quá 10 lần/phút/IP → 429 kèm Retry-After', async () => {
    let sawTooManyRequests = false;
    for (let attempt = 0; attempt < 15; attempt += 1) {
      const res = await login(`t-${runId}-${uniqueSuffix()}@nope.dev`, 'wrong-password');
      if (res.status === 429) {
        sawTooManyRequests = true;
        expect(res.headers['retry-after']).toBeDefined();
        break;
      }
    }
    expect(sawTooManyRequests).toBe(true);
  });
});
