/**
 * Chụp ảnh các trạng thái UI của Ping (skeleton / empty / error / toast) làm bằng chứng TF.9.
 *
 * Chạy (cần API + web dev server đang bật):
 *   WEB_PORT=3101 node apps/web/scripts/capture-states.mjs
 *
 * Ảnh ghi vào docs/v0.2.0/evidence/TF.9/screens/. Script tự tạo user/server riêng nên không
 * đụng dữ liệu dev. Mỗi ảnh đều được kiểm tra trạng thái ngay trước khi chụp: nếu trạng thái
 * không đúng (ví dụ skeleton chưa kịp hiện) thì ảnh đó bị báo lỗi thay vì tạo ra ảnh sai.
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
// Tên hiển thị của user vừa tạo: dùng để chờ panel thành viên tải xong (trạng thái "đã có dữ liệu").
const displayName = `shots_${suffix}`;

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

/** Chờ cho animation của antd (toast, modal) lắng xuống trước khi chụp. */
const SETTLE_MS = 700;

/**
 * Giữ một request treo tới khi được mở lại — dùng để chụp trạng thái "đang tải" chắc chắn,
 * không phụ thuộc cache của trình duyệt hay độ trễ mạng.
 */
function gate() {
  let release = () => {};
  let held = false;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  return {
    promise,
    release: () => release(),
    get held() {
      return held;
    },
    markHeld() {
      held = true;
    },
  };
}

async function shot(page, name, { fullPage = false } = {}) {
  await page.screenshot({ path: path.join(OUT_DIR, `${name}.png`), fullPage });
  captured.push(name);
  console.log(`✓ ${name}.png`);
}

async function capture(page, name, fn, options = {}) {
  try {
    await fn();
    // Kiểm tra trạng thái ngay trước khi chụp để không tạo ra ảnh sai.
    if (options.verify) await options.verify();
    await shot(page, name, options);
  } catch (error) {
    failed.push(`${name}: ${error.message}`);
    console.log(`✗ ${name}: ${error.message}`);
  }
}

/** Báo lỗi nếu điều kiện không đúng — để không chụp nhầm trạng thái. */
function expectState(condition, message) {
  if (!condition) throw new Error(message);
}

/** Số phần tử skeleton đang hiện (để phân biệt "đang tải" với "đã tải"). */
const skeletonCount = (page) => page.locator('[data-slot="skeleton"]').count();

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
  // Tắt cache HTTP: nếu không, lần sau trình duyệt lấy lại danh sách thành viên từ cache và
  // trạng thái "đang tải" không xuất hiện (ảnh skeleton sẽ trùng ảnh đã tải).
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
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
await capture(
  page,
  '03-empty-channel',
  async () => {
    await page.goto(`${BASE}/login`);
    await page.getByLabel('Email').filter({ visible: true }).fill(email);
    await page.getByLabel('Mật khẩu').filter({ visible: true }).fill(password);
    await page.getByRole('button', { name: 'Đăng nhập' }).click();
    await page.getByRole('link', { name: '# general' }).waitFor();
    await page.goto(`${BASE}/servers/${server.id}/channels/${emptyChannel.id}`);
    await page.getByRole('button', { name: 'Gửi tin đầu tiên' }).waitFor();
    // Chờ panel thành viên tải xong để ảnh khác với ảnh skeleton thành viên.
    await page.getByText(displayName).first().waitFor();
    await page.waitForTimeout(SETTLE_MS);
    await hideDevOverlay(page);
  },
  {
    verify: async () => {
      expectState(
        (await skeletonCount(page)) === 0,
        'vẫn còn skeleton: panel thành viên chưa tải xong',
      );
      expectState(
        (await page.getByText(displayName).count()) > 0,
        'chưa thấy danh sách thành viên trong ảnh',
      );
    },
  },
);

const channelUrl = `${BASE}/servers/${server.id}/channels/${emptyChannel.id}`;

// Skeleton tin nhắn: giữ request tin nhắn treo tới khi chụp xong.
const messagesGate = gate();
await capture(
  page,
  '04-message-skeleton',
  async () => {
    await page.route('**/api/v1/channels/*/messages**', async (route) => {
      if (route.request().method() !== 'GET') return route.continue();
      messagesGate.markHeld();
      await messagesGate.promise;
      await route.continue();
    });
    await page.goto(channelUrl);
    await page.getByRole('status', { name: 'Đang tải tin nhắn…' }).waitFor();
    await page.waitForTimeout(SETTLE_MS);
    await hideDevOverlay(page);
  },
  {
    verify: async () => {
      expectState(
        messagesGate.held,
        'request tin nhắn không bị giữ lại: không có trạng thái đang tải',
      );
      expectState((await skeletonCount(page)) > 0, 'không có skeleton tin nhắn trong ảnh');
    },
  },
);
messagesGate.release();
await page.unrouteAll({ behavior: 'ignoreErrors' });

// Skeleton thành viên: giữ request thành viên treo tới khi chụp xong.
const membersGate = gate();
await capture(
  page,
  '05-member-skeleton',
  async () => {
    await page.route('**/api/v1/servers/*/members**', async (route) => {
      membersGate.markHeld();
      await membersGate.promise;
      await route.continue();
    });
    await page.goto(channelUrl);
    await page.getByRole('status', { name: 'Đang tải thành viên…' }).waitFor();
    await page.waitForTimeout(SETTLE_MS);
    await hideDevOverlay(page);
  },
  {
    verify: async () => {
      expectState(
        membersGate.held,
        'request thành viên không bị giữ lại: không có trạng thái đang tải',
      );
      expectState((await skeletonCount(page)) > 0, 'không có skeleton thành viên trong ảnh');
      expectState(
        (await page.getByText(displayName).count()) === 0,
        'danh sách thành viên đã có dữ liệu: không phải trạng thái skeleton',
      );
    },
  },
);
membersGate.release();
await page.unrouteAll({ behavior: 'ignoreErrors' });

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
  await page.waitForTimeout(SETTLE_MS);
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
  await page.waitForTimeout(SETTLE_MS);
  await hideDevOverlay(page);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

await capture(page, '08-channel-empty', async () => {
  await page.route('**/api/v1/servers/*/channels', (route) =>
    route.fulfill({ status: 200, json: [] }),
  );
  await page.goto(channelUrl);
  await page.getByRole('button', { name: 'Tạo channel' }).waitFor();
  await page.waitForTimeout(SETTLE_MS);
  await hideDevOverlay(page);
  await page.unrouteAll({ behavior: 'ignoreErrors' });
});

await capture(page, '09-toast-copy-invite', async () => {
  await page.goto(channelUrl);
  await page.getByText(displayName).first().waitFor();
  await page.getByRole('button', { name: 'Sao chép mã mời' }).click();
  const toast = page.getByText('Đã sao chép mã mời.');
  await toast.waitFor();
  // Toast của antd trượt xuống từ trên: chờ animation lắng xuống thì mới thấy trong ảnh.
  await page.waitForTimeout(SETTLE_MS);
  const box = await toast.first().boundingBox();
  expectState(box !== null && box.y >= 0, `toast nằm ngoài khung nhìn (y=${box?.y})`);
  await hideDevOverlay(page);
});

await capture(page, '10-quick-switcher-empty', async () => {
  await page.goto(channelUrl);
  // Chờ app hydrate xong thì phím tắt mới được gắn.
  await page.getByRole('button', { name: 'Gửi tin đầu tiên' }).waitFor();
  await page.keyboard.press('Control+k');
  await page.getByTestId('quick-switcher-input').fill('khong-co-gi');
  await page.getByText('Không tìm thấy').waitFor();
  await page.waitForTimeout(SETTLE_MS);
  await hideDevOverlay(page);
  await page.keyboard.press('Escape');
});

await capture(
  page,
  '11-not-found',
  async () => {
    await page.goto(`${BASE}/khong-co-trang-nay`);
    await page.getByRole('heading', { name: 'Không tìm thấy trang' }).waitFor();
    await page.waitForTimeout(SETTLE_MS);
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
  await lightPage.getByText(displayName).first().waitFor();
  await lightPage.waitForTimeout(SETTLE_MS);
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
