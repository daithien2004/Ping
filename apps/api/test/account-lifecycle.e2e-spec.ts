import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ErrorCodes } from '@ping/shared';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { RedisProvider } from '../src/infra/redis/redis.module.js';
import { resetPasswordTemplate, verifyEmailTemplate } from '../src/mailer/templates.js';
import { REFRESH_COOKIE_NAME } from '../src/modules/auth/auth.constants.js';

/**
 * TG.8 — vòng đời tài khoản (e2e trên Postgres + Redis + Mailpit thật):
 * chính sách chưa xác minh, xác minh email qua token trong thư (Mailpit), quên/đặt lại
 * mật khẩu (phản hồi chống dò, token một lần lưu băm, thu hồi phiên), đổi mật khẩu,
 * danh sách/thu hồi phiên và rate limit gửi thư.
 *
 * Toàn suite chạy TUẦN TỰ (fileParallelism: false) và spec này KHÔNG flushdb giữa chừng:
 * register giới hạn 5/phút/IP nên (a)(b)(c) dùng chung một user đăng ký MỘT lần; forgot
 * đếm theo IP trong 1 giờ nên test rate limit (h) phải nằm CUỐI.
 */
const runId = Date.now().toString(36);
const PASSWORD = 'password123';
const NEW_PASSWORD = 'fresh-password-456';

// Mailpit của docker compose (f9892bd): UI/API 8025, SMTP 1025.
const MAILPIT = process.env.E2E_MAILPIT_URL ?? 'http://127.0.0.1:8025';

const VERIFY_SUBJECT = verifyEmailTemplate('vi', 'x').subject;
const RESET_SUBJECT = resetPasswordTemplate('vi', 'x').subject;

/** Hàng tóm tắt thư trong danh sách của Mailpit. */
interface MailpitSummary {
  ID: string;
  To: Array<{ Address: string }>;
  Subject: string;
}

const WEB = {
  Origin: process.env.WEB_ORIGIN ?? 'http://localhost:3000',
  'X-Ping-Client': 'web',
};

describe('Account lifecycle TG.8 (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const emails: string[] = [];

  // User dùng chung cho (a)(b)(c): đăng ký một lần vì trần register 5/phút/IP.
  const abc = { email: '', username: '', accessToken: '', verifyToken: '' };

  const uniqueSuffix = () => Math.random().toString(36).slice(2, 8);

  function trackUser(label: string) {
    const email = `tg8-${label}-${runId}-${uniqueSuffix()}@ping.dev`;
    const username = `tg8${label}${runId}${uniqueSuffix()}`
      .slice(0, 32)
      .replace(/[^a-z0-9_.-]/g, '');
    emails.push(email);
    return { email, username };
  }

  const http = () => request(app.getHttpServer());
  const api = (path: string) => `/api/v1${path}`;
  const register = (email: string, username: string) =>
    http().post(api('/auth/register')).send({ email, username, password: PASSWORD });
  const login = (email: string, password: string) =>
    http().post(api('/auth/login')).send({ email, password });
  /** Request kèm access token — supertest cần chọn verb trước nên bọc sẵn các verb dùng. */
  const as = (token: string) => {
    const header = { Authorization: `Bearer ${token}` };
    return {
      get: (url: string) => http().get(url).set(header),
      post: (url: string) => http().post(url).set(header),
      patch: (url: string) => http().patch(url).set(header),
      delete: (url: string) => http().delete(url).set(header),
    };
  };

  /** Cặp `name=value` của cookie refresh từ header Set-Cookie. */
  function refreshCookieOf(setCookie: string[] | string | undefined): string {
    const lines = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];
    const header = lines.find((cookie) => cookie.startsWith(`${REFRESH_COOKIE_NAME}=`));
    if (!header) throw new Error('Set-Cookie thiếu cookie refresh');
    return header.split(';')[0]!;
  }

  /** Đợi Mailpit có thư cho địa chỉ, trả token một lần trong link của body text. */
  async function mailTokenOf(email: string, subject: string, timeoutMs = 20_000): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const list = (await (await fetch(`${MAILPIT}/api/v1/messages?limit=100`)).json()) as {
        messages: MailpitSummary[];
      };
      const message = list.messages.find(
        (item) => item.Subject === subject && item.To.some((to) => to.Address === email),
      );
      if (message) {
        const detail = (await (await fetch(`${MAILPIT}/api/v1/message/${message.ID}`)).json()) as {
          Text?: string;
        };
        const match = detail.Text?.match(/token=([A-Za-z0-9_-]+)/);
        if (match) return match[1]!;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error(`Mailpit không nhận được thư cho ${email} trong ${timeoutMs}ms`);
  }

  beforeAll(async () => {
    // Spec này cần thư thật trong Mailpit để lấy token: bật SMTP TRƯỚC khi boot AppModule
    // (ConfigModule chụp env lúc boot; process.env thắng giá trị trong .env/vitest env).
    // Các spec khác giữ ConsoleMailer (SMTP_URL rỗng ở vitest.config.e2e) để không tốn
    // I/O SMTP cho thư không ai đọc.
    process.env.SMTP_URL = process.env.E2E_SMTP_URL ?? 'smtp://127.0.0.1:1025';

    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    // main.ts không chạy trong test: e2e tự lắp middleware + prefix (như auth.e2e-spec).
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    await app.init();
    prisma = app.get(PrismaService);
    // Xóa cửa sổ rate limit của run trước (giống auth.e2e-spec) — làm MỘT lần ở đây.
    await moduleRef.get(RedisProvider).flushdb();
  });

  afterAll(async () => {
    // Server của user (tạo ở test b) chặn xóa user qua FK Restrict — dọn trước,
    // cascade kéo theo channel/role/member/invite; sau đó user (EmailToken cascade theo).
    const users = await prisma.user.findMany({
      where: { email: { in: emails } },
      select: { id: true },
    });
    const ids = users.map((user) => user.id);
    await prisma.server.deleteMany({ where: { ownerId: { in: ids } } });
    await prisma.user.deleteMany({ where: { email: { in: emails } } });
    await app.close();
    // Khôi phục ConsoleMailer cho spec kế tiếp chạy trên cùng worker vitest.
    process.env.SMTP_URL = '';
  });

  it('(a) register → đặt lại chưa xác minh → tạo server bị chặn 403 VERIFY_REQUIRED', async () => {
    const { email, username } = trackUser('abc');
    abc.email = email;
    abc.username = username;
    const res = await register(email, username).expect(201);
    abc.accessToken = res.body.accessToken;
    // e2e mặc định coi user đăng ký là đã xác minh (auto-verify khi NODE_ENV=test, lý do
    // ở AuthService.register) — test chủ động đặt lại để đi đúng luồng chưa xác minh.
    await prisma.user.update({ where: { email }, data: { emailVerified: false } });
    const me = await as(abc.accessToken).get(api('/users/me')).expect(200);
    expect(me.body.emailVerified).toBe(false);

    const created = await as(abc.accessToken)
      .post(api('/servers'))
      .send({ name: 'Chưa xác minh' })
      .expect(403);
    expect(created.body.code).toBe(ErrorCodes.VERIFY_REQUIRED);
  });

  it('(b) thư verify đến Mailpit → xác minh 204 → GET /users/me emailVerified=true → tạo server OK', async () => {
    abc.verifyToken = await mailTokenOf(abc.email, VERIFY_SUBJECT);
    await http().post(api('/auth/verify-email')).send({ token: abc.verifyToken }).expect(204);

    // Verify-email đảo lại cờ false mà (a) đã đặt — bằng chứng endpoint đổi trạng thái thật.
    const me = await as(abc.accessToken).get(api('/users/me')).expect(200);
    expect(me.body.emailVerified).toBe(true);

    await as(abc.accessToken).post(api('/servers')).send({ name: 'Đã xác minh' }).expect(201);
  });

  it('(c) token xác minh dùng lại → 400 VERIFY_TOKEN_INVALID; token vớ vẩn cũng vậy', async () => {
    // Token của (b) đã tiêu: dùng lại bị từ chối bằng CÙNG MỘT mã (sai/hết hạn/đã dùng).
    const reused = await http()
      .post(api('/auth/verify-email'))
      .send({ token: abc.verifyToken })
      .expect(400);
    expect(reused.body.code).toBe(ErrorCodes.VERIFY_TOKEN_INVALID);

    const garbage = await http()
      .post(api('/auth/verify-email'))
      .send({ token: 'x'.repeat(32) })
      .expect(400);
    expect(garbage.body.code).toBe(ErrorCodes.VERIFY_TOKEN_INVALID);
  });

  it('(d) forgot — email có thật và không có thật: cùng 202, body giống hệt (chống dò tài khoản)', async () => {
    const existing = await http()
      .post(api('/auth/password/forgot'))
      .send({ email: abc.email })
      .expect(202);
    const unknown = await http()
      .post(api('/auth/password/forgot'))
      .send({ email: `khong-ton-tai-${runId}@ping.dev` })
      .expect(202);
    expect(JSON.stringify(existing.body)).toBe(JSON.stringify(unknown.body));
    expect(existing.body).toEqual({ status: 'queued' });
  });

  it('(e) reset flow — token từ Mailpit → reset 204 (token lưu băm) → mật khẩu mới vào được, phiên cũ chết', async () => {
    const { email, username } = trackUser('e');
    const registerRes = await register(email, username).expect(201);
    const cookieOld = refreshCookieOf(registerRes.headers['set-cookie']);

    await http().post(api('/auth/password/forgot')).send({ email }).expect(202);
    const token = await mailTokenOf(email, RESET_SUBJECT);

    const rowBefore = await prisma.emailToken.findFirst({
      where: { user: { email }, kind: 'reset' },
    });
    expect(rowBefore?.tokenHash).not.toBe(token); // DB chỉ giữ băm, không giữ token thô

    await http()
      .post(api('/auth/password/reset'))
      .send({ token, password: NEW_PASSWORD })
      .expect(204);

    const row = await prisma.emailToken.findUnique({ where: { id: rowBefore!.id } });
    expect(row?.usedAt).not.toBeNull();

    // Đặt lại mật khẩu thu hồi MỌI phiên — refresh cookie cũ phải chết ngay.
    await http().post(api('/auth/refresh')).set(WEB).set('Cookie', cookieOld).expect(401);

    await login(email, PASSWORD).expect(401);
    await login(email, NEW_PASSWORD).expect(200);
  });

  it('(f) sessions — hai phiên thấy đúng 2 dòng, current đúng; thu hồi phiên kia thì refresh của nó 401', async () => {
    const { email, username } = trackUser('f');
    const registerRes = await register(email, username).expect(201);
    const tokenA = registerRes.body.accessToken as string;
    const cookieA = refreshCookieOf(registerRes.headers['set-cookie']);

    const loginRes = await login(email, PASSWORD).expect(200);
    const tokenB = loginRes.body.accessToken as string;
    const cookieB = refreshCookieOf(loginRes.headers['set-cookie']);

    // register tạo một phiên (A), login tạo phiên thứ hai (B).
    const listA = await as(tokenA).get(api('/users/me/sessions')).expect(200);
    expect(listA.body.sessions).toHaveLength(2);
    expect(listA.body.sessions.filter((s: { current: boolean }) => s.current)).toHaveLength(1);
    const currentA = listA.body.sessions.find((s: { current: boolean }) => s.current)!;
    const otherB = listA.body.sessions.find((s: { current: boolean }) => !s.current)!;
    expect(currentA.device).toBeTruthy();

    // Người nhìn từ phiên B cũng thấy đúng phiên của mình là current (claim sid trong JWT).
    const listB = await as(tokenB).get(api('/users/me/sessions')).expect(200);
    expect(listB.body.sessions.find((s: { current: boolean }) => s.current)!.id).toBe(
      listB.body.sessions.find((s: { id: string }) => s.id !== currentA.id)!.id,
    );

    // IDOR: người khác không thu hồi được phiên của mình (không tồn tại với họ).
    const stranger = await login(/* user của (e) */ emails[1], NEW_PASSWORD).expect(200);
    await http()
      .delete(`${api('/users/me/sessions')}/${currentA.id}`)
      .set('Authorization', `Bearer ${stranger.body.accessToken}`)
      .expect(404);

    // Thu hồi phiên B từ phiên A → refresh của B chết, của A còn sống.
    await as(tokenA)
      .delete(`${api('/users/me/sessions')}/${otherB.id}`)
      .expect(204);
    await http().post(api('/auth/refresh')).set(WEB).set('Cookie', cookieB).expect(401);
    await http().post(api('/auth/refresh')).set(WEB).set('Cookie', cookieA).expect(200);
  });

  it('(g) change-password — sai mật khẩu hiện tại 400; đổi xong phiên khác chết, phiên hiện tại sống', async () => {
    const { email, username } = trackUser('g');
    const registerRes = await register(email, username).expect(201);
    const tokenA = registerRes.body.accessToken as string;
    const cookieA = refreshCookieOf(registerRes.headers['set-cookie']);

    const loginRes = await login(email, PASSWORD).expect(200);
    const cookieB = refreshCookieOf(loginRes.headers['set-cookie']);

    await as(tokenA)
      .patch(api('/users/me/password'))
      .send({ currentPassword: 'sai-mat-khau', password: NEW_PASSWORD })
      .expect(400);

    await as(tokenA)
      .patch(api('/users/me/password'))
      .send({ currentPassword: PASSWORD, password: NEW_PASSWORD })
      .expect(204);

    // Phiên B (khác) chết — refresh 401; phiên A sống; đăng nhập bằng mật khẩu mới OK.
    await http().post(api('/auth/refresh')).set(WEB).set('Cookie', cookieB).expect(401);
    // Phiên A refresh thành công (rotation tạo hàng phiên mới) — client thật sẽ cất
    // access token MỚI từ response này; test cũng vậy để `sid` trỏ đúng phiên đang sống.
    const refreshedA = await http()
      .post(api('/auth/refresh'))
      .set(WEB)
      .set('Cookie', cookieA)
      .expect(200);
    const tokenA2 = refreshedA.body.accessToken as string;
    const cookieA2 = refreshCookieOf(refreshedA.headers['set-cookie']);
    await login(email, NEW_PASSWORD).expect(200);

    // "Đăng xuất mọi nơi khác": những phiên còn lại bị thu hồi, phiên hiện tại giữ nguyên.
    await as(tokenA2).delete(api('/users/me/sessions')).expect(204);
    const list = await as(tokenA2).get(api('/users/me/sessions')).expect(200);
    expect(list.body.sessions).toHaveLength(1);
    expect(list.body.sessions[0].current).toBe(true);
    await http().post(api('/auth/refresh')).set(WEB).set('Cookie', cookieA2).expect(200);
  });

  // LUÔN để cuối: forgot đếm theo IP trong cửa sổ 1 giờ — (d) đã tiêu 2 lượt, (e) 1 lượt,
  // hammer tới khi vượt trần 10/giờ (lượt 11) → 429. Re-run toàn bộ trong 1 giờ vẫn xanh
  // nhờ flushdb ở beforeAll.
  it('(h) rate limit forgot — 10 lượt/giờ theo IP, lượt 11 → 429 kèm Retry-After', async () => {
    let saw429 = false;
    for (let attempt = 0; attempt < 15 && !saw429; attempt += 1) {
      const res = await http()
        .post(api('/auth/password/forgot'))
        .send({ email: `tg8-hammer-${runId}-${attempt}@ping.dev` });
      if (res.status === 429) {
        saw429 = true;
        expect(res.body.code).toBe(ErrorCodes.TOO_MANY_REQUESTS);
        expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
      } else {
        expect(res.status).toBe(202);
      }
    }
    expect(saw429).toBe(true);
  });
});
