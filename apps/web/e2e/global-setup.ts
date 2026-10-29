import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import type { AuthResponse, ChannelDto, ServerDetail } from '@ping/shared';

export const API = 'http://localhost:4000/api/v1';
const HEALTH = 'http://localhost:4000/api/v1/health';
const MAILPIT = 'http://127.0.0.1:8025/api/v1';
// apps/web là CommonJS: Playwright biên dịch file này sang CJS nên có __dirname, không có import.meta.
const repoRoot = path.resolve(__dirname, '../../..');

/**
 * Chờ API sẵn sàng trước khi seed. API chạy ở chế độ watch nên có thể đang khởi động lại
 * (sửa mã nguồn → nest watch restart) lúc bắt đầu run; không chờ thì test fail với lỗi mạng
 * khó hiểu thay vì thông báo rõ ràng.
 */
async function waitForApi(timeoutMs = 30_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let lastError = 'chưa phản hồi';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(HEALTH);
      if (response.ok) return;
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(
    `API chưa sẵn sàng tại ${HEALTH} (${lastError}). Hãy bật API (pnpm --filter api dev) rồi chạy lại.`,
  );
}

/**
 * Dữ liệu riêng cho mỗi lần chạy (không đụng dữ liệu dev): một user mới, một server, channel
 * #long có 300 tin. Truyền cho test qua process.env (Playwright chuyển env của globalSetup sang
 * worker).
 */
export default async function globalSetup() {
  await waitForApi();

  const id = randomUUID().slice(0, 8);
  const email = `e2e-${id}@example.test`;
  const password = 'e2e-password';

  const auth = await post<AuthResponse>('/auth/register', {
    email,
    username: `e2e_${id}`,
    password,
  });
  const token = auth.accessToken;
  await verifyEmailFromMailpit(email);
  // Chốt chặn: máy dev không cấu hình SMTP_URL thì API dùng ConsoleMailer (không có thư
  // trong Mailpit) — đặt cờ thẳng DB để seed vẫn chạy được, chi tiết ở hàm bên dưới.
  await ensureVerifiedForSeed(email, token);
  const server = await post<ServerDetail>('/servers', { name: `E2E ${id}` }, token);
  const channel = await post<ChannelDto>(`/servers/${server.id}/channels`, { name: 'long' }, token);

  // Ghi thẳng DB bằng script dev: gửi 300 tin qua API sẽ chạm rate limit.
  process.loadEnvFile(path.join(repoRoot, '.env'));
  // shell: Windows chạy pnpm qua pnpm.cmd. Hai id do server sinh (UUID) nên ghép chuỗi an toàn.
  const seed = spawnSync(
    `pnpm --filter api exec tsx prisma/seed-messages.ts ${channel.id} ${auth.user.id} 300`,
    { cwd: repoRoot, stdio: 'inherit', shell: true },
  );
  if (seed.status !== 0) {
    throw new Error('seed-messages failed');
  }

  // Script seed có thể chạm vào file mà API đang watch (ví dụ sinh lại Prisma client) → nest
  // restart API giữa chừng, test gặp ECONNREFUSED. Chờ API sẵn sàng lại trước khi chạy test.
  await waitForApi(60_000);

  process.env.E2E_EMAIL = email;
  process.env.E2E_PASSWORD = password;
  process.env.E2E_SERVER_ID = server.id;
  process.env.E2E_CHANNEL_ID = channel.id;
}

async function post<T>(path: string, body: unknown, token?: string): Promise<T> {
  const response = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`POST ${path} → ${response.status}: ${await response.text()}`);
  }
  return (await response.json()) as T;
}

/** POST chỉ cần biết thành công hay không — endpoint 204 không body (verify-email). */
async function postNoBody(path: string, body: unknown): Promise<boolean> {
  const response = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return response.ok;
}

/**
 * Chốt chặn seed e2e (TG.8): nếu sau Mailpit user VẪN chưa xác minh (API dev không cấu
 * hình SMTP_URL → ConsoleMailer chỉ ghi log, Mailpit không bao giờ có thư) thì đặt
 * `emailVerified` thẳng DB bằng script dev — cùng pattern seed-messages.ts phía dưới.
 * Không phải đường "thật" nhưng seed phải chạy được trên mọi máy dev, kể cả không bật
 * Mailpit; khi SMTP_URL có cấu hình thì hàm này chỉ là một GET /users/me no-op.
 */
async function ensureVerifiedForSeed(email: string, token: string): Promise<void> {
  const me = await fetch(`${API}/users/me`, {
    headers: { authorization: `Bearer ${token}` },
  });
  if (me.ok && ((await me.json()) as { emailVerified?: boolean }).emailVerified === true) {
    return;
  }
  // verify-user cần DATABASE_URL: nạp .env gốc sớm hơn seed-messages (nạp hai lần vô hại).
  try {
    process.loadEnvFile(path.join(repoRoot, '.env'));
  } catch {
    // Không có .env (CI truyền env qua biến) — script tự báo thiếu DATABASE_URL nếu thế.
  }
  // shell: Windows chạy pnpm qua pnpm.cmd; email do API sinh (an toàn khi ghép chuỗi).
  const script = spawnSync(`pnpm --filter api exec tsx scripts/verify-user.ts ${email}`, {
    cwd: repoRoot,
    stdio: 'inherit',
    shell: true,
  });
  if (script.status !== 0) {
    throw new Error('verify-user failed — không xác minh được user seed cho e2e');
  }
}

/**
 * TG.8: user chưa xác minh email bị chặn tạo server/mã mời (VERIFY_REQUIRED) — seed e2e tạo
 * server ngay sau đăng ký nên phải xác minh luôn. Lấy token từ thư Mailpit gửi cho đúng địa
 * chỉ rồi POST /auth/verify-email. Best-effort (đợi tối đa 15s): khi API máy này chưa gửi
 * thư (TG.8 của API chưa về) thì bỏ qua để seed vẫn chạy được như trước.
 */
async function verifyEmailFromMailpit(email: string): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const mailToken = await findMailToken(email, '/verify');
    if (mailToken) {
      // /auth/verify-email trả 204 KHÔNG body — post() parse JSON sẽ văng trên 204, dùng
      // fetch riêng chỉ cần biết ok hay không (token hỏng → false → thử lại tới hết hạn).
      if (await postNoBody('/auth/verify-email', { token: mailToken })) {
        return;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  console.warn(
    `[web-e2e] không lấy được thư xác minh Mailpit cho ${email} — nếu API đã bật chính sách ` +
      'VERIFY_REQUIRED thì bước tạo server phía dưới sẽ đỏ.',
  );
}

/**
 * Tìm token trong link `path?token=...` của thư gửi cho `email` (Mailpit API). Danh sách
 * /messages không kèm body — phải đọc từng thư qua /message/:id; chọn thư MỚI NHẤT khớp
 * trước vì token một-lần-dùng, thư cũ của lần chạy trước không dùng lại được. `sinceMs`
 * (tuỳ chọn) bỏ qua thư cũ hơn mốc này: cần khi email ĐÃ nhận thư cùng loại trước đó và
 * thư mới chưa kịp tới — không vậy poller trả token cũ đã dùng (flakes giữa hai lần chạy).
 */
export async function findMailToken(
  email: string,
  path: '/verify' | '/reset-password',
  sinceMs?: number,
): Promise<string | undefined> {
  try {
    const response = await fetch(`${MAILPIT}/messages`);
    if (!response.ok) return undefined;
    const body = (await response.json()) as {
      messages?: { ID: string; To?: { Address?: string }[]; Created?: string }[];
    };
    const candidates = (body.messages ?? [])
      .filter(
        (item) =>
          (item.To ?? []).some((to) => to.Address === email) &&
          (sinceMs === undefined || Date.parse(item.Created ?? '') >= sinceMs - 5_000),
      )
      .sort((a, b) => Date.parse(b.Created ?? '') - Date.parse(a.Created ?? ''));
    for (const item of candidates) {
      const detail = (await (await fetch(`${MAILPIT}/message/${item.ID}`)).json()) as {
        Text?: string;
        HTML?: string;
      };
      const mailToken =
        detail.Text?.match(new RegExp(`${path}\\?token=([A-Za-z0-9._-]+)`))?.[1] ??
        detail.HTML?.match(new RegExp(`${path}\\?token=([A-Za-z0-9._-]+)`))?.[1];
      if (mailToken) return mailToken;
    }
  } catch {
    // Mailpit chưa sẵn sàng: trả undefined để caller thử lại.
  }
  return undefined;
}
