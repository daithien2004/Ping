/**
 * Chụp ảnh các trạng thái UI của Ping (skeleton / empty / error / toast) làm bằng chứng TF.9.
 *
 * Chạy (cần API + web dev server đang bật):
 *   WEB_PORT=3101 node apps/web/scripts/capture-states.mjs
 *
 * Ảnh ghi vào docs/v0.2.0/evidence/TF.9/screens/. Script tự tạo user/server riêng nên không
 * đụng dữ liệu dev.
 */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const OUT_DIR = path.join(repoRoot, 'docs', 'v0.2.0', 'evidence', 'TF.9', 'screens');
const WEB_PORT = process.env.WEB_PORT ?? 3101;
const BASE = `http://localhost:${WEB_PORT}`;
const API = 'http://localhost:4000/api/v1';
const REQUEST_ID = '0b7c6e0e-5d4f-4c53-8a3e-6f5d8c1a9e42';

const suffix = Math.random().toString(36).slice(2, 8);
const email = `shots-${suffix}@example.test`;
const password = 'e2e-password';

async function api(pathname, { method = 'POST', body, token } = {}) {
  const res = await fetch(`${API}${pathname}`, {
    method,
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${pathname} → ${res.status}: ${await res.text()}`);
  return res.status === 204 ? undefined : res.json();
}

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const captured = [];
const failed = [];

async function shot(page, name, { fullPage = false } = {}) {
  await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`), fullPage });
  captured.push(name);
  console.log(`✓ ${name}.png`);
}

async function capture(page, name, fn, options) {
  try {
    await fn();
    await shot(page, name, options);
  } catch (error) {
    failed.push(`${name}: ${error.message}`);
    console.log(`✗ ${name}: ${error.message}`);
  }
}

const auth = await api('/auth/register', {
  body: { email, username: `shots_${suffix}`, password },
});
const server = await api('/servers', {
  body: { name: `Screens ${suffix}` },
  token: auth.accessToken,
});
const emptyChannel = await api(`/servers/${server.id}/channels`, {
  body: { name: 'trong' },
  token: auth.accessToken,
});

await mkdir(OUT_DIR, { recursive: true });
const browser = await chromium.launch();

/** Ẩn bảng dev tools của Next để ảnh sạch. */
const hideDevOverlay = async (page) => {
  await page.addStyleTag({
    content: 'nextjs-portal, [data-nextjs-toast] { display: none !important; }',
  });
};

async function newPage(colorScheme) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    colorScheme,
    locale: 'vi-VN',
  });
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const page = await context.newPage();
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log(`  [console] ${msg.text()}`);
  });
  return { context, page };
}

const { context, page } = await newPage('dark');

await capture(page, '01-login', async () => {
  await page.goto(`${BASE}/login`);
  await page.getByRole('heading', { name: 'Đăng nhập' }).waitFor();
  await hideDevOverlay(page);
});

await capture(page, '02-auth-error', async () => {
  await page.route('**/api/v1/auth/refresh**', (route) => route.abort());
  await page.route('**/api/v1/users/me**', (route) => route.abort());
  await page.goto(`${BASE}/login`);
  await page.getByRole('heading', { name: 'Không kiểm tra được phiên đăng nhập' }).waitFor();
  await hideDevOverlay(page);
});

// Bỏ chặn mạng rồi đăng nhập thật để chụp các trạng thái trong app.
await page.unrouteAll({ behavior: 'ignoreErrors' });
await capture(page, '03-empty-channel', async () => {
  await page.goto(`${BASE}/login`);
  await page.getByLabel('Email').filter({ visible: true }).fill(email);
  await page.getByLabel('Mật khẩu').filter({ visible: true }).fill(password);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.getByRole('link', { name: '# general' }).waitFor();
  await page.goto(`${BASE}/servers/${server.id}/channels/${emptyChannel.id}`);
  await page.getByRole('button', { name: 'Gửi tin đầu tiên' }).waitFor();
  await hideDevOverlay(page);
});

const channelUrl = `${BASE}/servers/${server.id}/channels/${emptyChannel.id}`;

await capture(page, '04-message-skeleton', async () => {
  await page.route('**/api/v1/channels/*/messages**', async (route) => {
    if (route.request().method() === 'GET') await delay(3000);
    await route.continue();
  });
  await page.goto(channelUrl);
  await page.getByRole('status', { name: 'Đang tải tin nhắn…' }).waitFor();
  await hideDevOverlay(page);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

await capture(page, '05-member-skeleton', async () => {
  await page.route('**/api/v1/servers/*/members**', async (route) => {
    await delay(3000);
    await route.continue();
  });
  await page.goto(channelUrl);
  await page.getByRole('status', { name: 'Đang tải thành viên…' }).waitFor();
  await hideDevOverlay(page);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

await capture(page, '06-member-error', async () => {
  await page.route('**/api/v1/servers/*/members**', (route) =>
    route.fulfill({
      status: 500,
      headers: { 'X-Request-Id': REQUEST_ID },
      json: { code: 'INTERNAL_ERROR', message: 'x', requestId: REQUEST_ID },
    }),
  );
  await page.goto(channelUrl);
  await page.getByRole('alert').filter({ hasText: 'Mã lỗi' }).first().waitFor();
  await hideDevOverlay(page);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

await capture(page, '07-content-error', async () => {
  await page.route('**/api/v1/servers/*/channels', (route) =>
    route.fulfill({
      status: 500,
      headers: { 'X-Request-Id': REQUEST_ID },
      json: { code: 'INTERNAL_ERROR', message: 'x', requestId: REQUEST_ID },
    }),
  );
  await page.goto(channelUrl);
  await page.getByRole('alert').filter({ hasText: 'Không truy cập được' }).waitFor();
  await hideDevOverlay(page);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

await capture(page, '08-channel-empty', async () => {
  await page.route('**/api/v1/servers/*/channels', (route) =>
    route.fulfill({ status: 200, json: [] }),
  );
  await page.goto(channelUrl);
  await page.getByRole('button', { name: 'Tạo channel' }).waitFor();
  await hideDevOverlay(page);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

await capture(page, '09-toast-copy-invite', async () => {
  await page.goto(channelUrl);
  await page.getByRole('button', { name: 'Sao chép mã mời' }).click();
  await page.getByText('Đã sao chép mã mời.').waitFor();
  await hideDevOverlay(page);
});

await capture(page, '10-quick-switcher-empty', async () => {
  await page.goto(channelUrl);
  // Chờ app hydrate xong thì phím tắt mới được gắn.
  await page.getByRole('button', { name: 'Gửi tin đầu tiên' }).waitFor();
  await page.keyboard.press('Control+k');
  await page.getByTestId('quick-switcher-input').fill('khong-co-gi');
  await page.getByText('Không tìm thấy').waitFor();
  await hideDevOverlay(page);
  await page.keyboard.press('Escape');
});

await capture(
  page,
  '11-not-found',
  async () => {
    await page.goto(`${BASE}/khong-co-trang-nay`);
    await page.getByRole('heading', { name: 'Không tìm thấy trang' }).waitFor();
    await hideDevOverlay(page);
  },
  { fullPage: true },
);

// Bản sáng của màn chính để thấy trạng thái ở cả hai nền.
const { context: lightContext, page: lightPage } = await newPage('light');
await capture(lightPage, '12-chat-light', async () => {
  await lightPage.goto(`${BASE}/login`);
  await lightPage.getByLabel('Email').filter({ visible: true }).fill(email);
  await lightPage.getByLabel('Mật khẩu').filter({ visible: true }).fill(password);
  await lightPage.getByRole('button', { name: 'Đăng nhập' }).click();
  await lightPage.getByRole('link', { name: '# general' }).waitFor();
  await lightPage.goto(channelUrl);
  await lightPage.getByRole('button', { name: 'Gửi tin đầu tiên' }).waitFor();
  await hideDevOverlay(lightPage);
});

await lightContext.close();
await context.close();
await browser.close();

console.log(`\n${captured.length} ảnh: ${captured.join(', ')}`);
if (failed.length > 0) {
  console.log(`\n${failed.length} lỗi:`);
  for (const item of failed) console.log(` - ${item}`);
  process.exitCode = 1;
}
