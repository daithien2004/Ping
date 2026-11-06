import { defineConfig, devices } from '@playwright/test';

/**
 * E2E của web chạy trên app thật (API + Postgres + Redis): cần `docker compose up -d`.
 * Playwright tự bật API + web trên CSDL `ping_e2e` (xem ADR-0082 bên dưới).
 * KHÔNG nằm trong `pnpm test` vì cần hạ tầng.
 */
/** Cổng web: mặc định 3000, đổi bằng WEB_PORT khi máy đang bận cổng 3000 (app khác). */
const webPort = Number(process.env.WEB_PORT ?? 3000);

/**
 * E2E_PRODUCTION=1 (CI): web chạy `next start` và API chạy `start:prod` trên bản build
 * — loại chi phí compile lạnh từng route của next dev (đo baseline: test:e2e chiếm 85–90%
 * thời gian job CI). Máy dev giữ chế độ dev cho vòng lặp nhanh; đặt biến này khi cần tái lập.
 * Chế độ production yêu cầu build trước: `pnpm --filter api build && pnpm --filter web build`.
 */
const production = process.env.E2E_PRODUCTION === '1';

/**
 * ADR-0082: ở máy dev, e2e chạy trên CSDL riêng `ping_e2e` để không để rác trong CSDL dev `ping`.
 * Vì vậy Playwright tự bật API/web (không dùng lại `pnpm dev` đang trỏ `ping`): tắt `pnpm dev`
 * trước khi chạy. Đặt vào process.env để API, globalSetup và spec (seed-messages, verify-user)
 * cùng dùng; dotenv/ConfigModule không ghi đè biến đã có. CI: CSDL của job đã riêng, giữ nguyên.
 */
const ci = !!process.env.CI;
if (!ci) process.env.DATABASE_URL = 'postgresql://ping:ping@localhost:5432/ping_e2e';
// Máy dev khởi động nguội (nest compile + next dev + chuẩn bị CSDL) có thể quá 2 phút.
const startTimeout = ci ? 120_000 : 300_000;

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/global-setup.ts',
  // Các luồng chạy nối tiếp trên một trang; chạy song song dễ chạm rate limit 100 request/phút/IP.
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  // Trên CI thêm reporter `github`: test hỏng hiện thành annotation đọc được ngay trên trang chạy.
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    baseURL: `http://localhost:${webPort}`,
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
  },
  webServer: [
    {
      command: [
        ci ? '' : 'node ../../scripts/prepare-e2e-db.mjs && ',
        production ? 'pnpm --filter api start:prod' : 'pnpm --filter api start:dev',
      ].join(''),
      url: 'http://localhost:4000/api/v1/health',
      reuseExistingServer: ci,
      timeout: startTimeout,
      // CORS của API cho phép đúng origin của web e2e: khi WEB_PORT khác 3000 (cổng bận),
      // browser ở cổng khác bị chặn CORS nếu API vẫn chỉ cho phép 3000.
      env: { ...process.env, WEB_ORIGIN: `http://localhost:${webPort}` },
      // Windows: SIGTERM cho process tree (Playwright tự kill cây tiến trình) thay vì kill theo tên node.exe.
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
    },
    {
      command: production ? 'pnpm --filter web start' : 'pnpm --filter web dev',
      url: `http://localhost:${webPort}`,
      reuseExistingServer: ci,
      timeout: startTimeout,
      // `next start`/`next dev` đọc PORT; truyền kèm để không đụng cổng của app khác trên máy.
      env: { ...process.env, PORT: String(webPort) },
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
    },
  ],
});
