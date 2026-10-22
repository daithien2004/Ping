import { defineConfig, devices } from '@playwright/test';

/**
 * E2E của web chạy trên app thật (API + Postgres + Redis): cần `docker compose up -d`.
 * Đang có dev server thì dùng lại, chưa có thì Playwright tự bật (cùng lệnh .claude/launch.json).
 * KHÔNG nằm trong `pnpm test` vì cần hạ tầng.
 */
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
    baseURL: 'http://localhost:3000',
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
      url: 'http://localhost:3000',
      reuseExistingServer: true,
      timeout: 120_000,
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
    },
  ],
});
