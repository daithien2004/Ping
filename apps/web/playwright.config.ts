import { defineConfig, devices } from '@playwright/test';

/**
 * E2E của web chạy trên app thật (API + Postgres + Redis): cần `docker compose up -d`.
 * Đang có dev server thì dùng lại, chưa có thì Playwright tự bật (cùng lệnh .claude/launch.json).
 * KHÔNG nằm trong `pnpm test` vì cần hạ tầng.
 */
/** Cổng web: mặc định 3000, đổi bằng WEB_PORT khi máy đang bận cổng 3000 (app khác). */
const webPort = Number(process.env.WEB_PORT ?? 3000);

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
      command: 'pnpm --filter api start:dev',
      url: 'http://localhost:4000/api/v1/health',
      reuseExistingServer: true,
      timeout: 120_000,
      // Windows: SIGTERM cho process tree (Playwright tự kill cây tiến trình) thay vì kill theo tên node.exe.
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
    },
    {
      command: 'pnpm --filter web dev',
      url: `http://localhost:${webPort}`,
      reuseExistingServer: true,
      timeout: 120_000,
      // `next dev` đọc PORT; truyền kèm để không đụng cổng của app khác trên máy.
      env: { ...process.env, PORT: String(webPort) },
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
    },
  ],
});
