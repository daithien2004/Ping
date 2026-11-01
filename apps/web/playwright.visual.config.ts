import { defineConfig, devices } from '@playwright/test';

/**
 * TF.13: visual regression trên app thật (API + Postgres + Redis) — cùng hạ tầng với e2e,
 * nhưng tách config/thư mục để `pnpm test:e2e` không kéo theo ảnh baseline.
 *
 * Baseline so sánh pixel giữa hai lần chạy, nên mọi thứ phải tái lập được: dữ liệu seed cố
 * định id/nội dung, viewport + múi giờ + locale cố định, font Geist tự host (cùng tệp woff2
 * trên mọi hệ điều hành), thanh cuộn ẩn trong test, `<time>` ẩn bằng `visibility`.
 *
 * Luôn chạy bản production để ảnh không lẫn khác biệt dev/prod (CSS dev overlay, chunk dev).
 * Script `test:visual` có `pretest:visual` build API + web trước, tránh so với bản cũ.
 */
const webPort = Number(process.env.WEB_PORT ?? 3000);

export default defineConfig({
  testDir: './visual',
  globalSetup: './visual/global-setup.ts',
  // Tách baseline theo hệ điều hành: cùng tệp font nhưng khử răng cưa DirectWrite (Windows)
  // và FreeType (Linux) khác nhau đủ để vượt ngưỡng. Mỗi nền tảng so với bộ ảnh của chính nó;
  // job CI `visual` tự bootstrap bộ Linux ở lần chạy đầu rồi upload artifact để commit.
  snapshotPathTemplate: '{testDir}/__screenshots__/{platform}/{arg}{ext}',
  workers: 1,
  fullyParallel: false,
  timeout: 120_000,
  expect: {
    timeout: 15_000,
    toHaveScreenshot: {
      animations: 'disabled',
      caret: 'hide',
      scale: 'css',
      threshold: 0.3,
      maxDiffPixelRatio: 0.015,
    },
  },
  reporter: process.env.CI ? [['list'], ['github']] : 'list',
  use: {
    baseURL: `http://localhost:${webPort}`,
    trace: 'retain-on-failure',
    ...devices['Desktop Chrome'],
    viewport: { width: 1280, height: 800 },
    deviceScaleFactor: 1,
    locale: 'vi-VN',
    timezoneId: 'Asia/Ho_Chi_Minh',
    reducedMotion: 'reduce',
  },
  webServer: [
    {
      command: 'pnpm --filter api start:prod',
      url: 'http://localhost:4000/api/v1/health',
      reuseExistingServer: true,
      timeout: 120_000,
      env: { ...process.env, WEB_ORIGIN: `http://localhost:${webPort}` },
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
    },
    {
      command: 'pnpm --filter web start',
      url: `http://localhost:${webPort}`,
      reuseExistingServer: true,
      timeout: 120_000,
      env: { ...process.env, PORT: String(webPort) },
      gracefulShutdown: { signal: 'SIGTERM', timeout: 5_000 },
    },
  ],
});
