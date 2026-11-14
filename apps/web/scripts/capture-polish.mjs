/** WEB_PORT=3000 node apps/web/scripts/capture-polish.mjs  (cần API + web đang chạy) */
import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../../..');
const OUT_T67 = path.join(repoRoot, 'docs', 'v0.2.0', 'evidence', 'T6.7', 'screens');
const OUT_T68 = path.join(repoRoot, 'docs', 'v0.2.0', 'evidence', 'T6.8', 'screens');
const WEB_PORT = process.env.WEB_PORT ?? 3000;
const BASE = `http://localhost:${WEB_PORT}`;
const API = 'http://localhost:4000/api/v1';
const REQUEST_ID = '0b7c6e0e-5d4f-4c53-8a3e-6f5d8c1a9e42';
const SETTLE_MS = 700;

const suffix = Math.random().toString(36).slice(2, 8);
// User mới đăng ký phải xác minh email mới tạo được server: dùng tài khoản seed rồi tạo server riêng.
const owner = {
  email: process.env.CAPTURE_EMAIL ?? 'alice@ping.dev',
  password: process.env.CAPTURE_PASSWORD ?? 'password123',
};

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

const captured = [];
const failed = [];

async function shot(page, dir, name, { fullPage = false } = {}) {
  await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage });
  captured.push(name);
  console.log(`✓ ${name}.png`);
}

async function capture(page, dir, name, fn, options = {}) {
  try {
    await fn();
    if (options.verify) await options.verify();
    await page.waitForTimeout(SETTLE_MS);
    await hideDevOverlay(page);
    await shot(page, dir, name, options);
  } catch (error) {
    failed.push(`${name}: ${error.message}`);
    console.log(`✗ ${name}: ${error.message}`);
  }
}

function expectState(condition, message) {
  if (!condition) throw new Error(message);
}

const hideDevOverlay = async (page) => {
  await page.addStyleTag({
    content: 'nextjs-portal, [data-nextjs-toast] { display: none !important; }',
  });
};

const ownerAuth = await api('/auth/login', { body: owner });
const partner = {
  email: 'polish-dm@example.test',
  username: 'polish_dm',
  password: 'e2e-password',
};
const partnerAuth = await api('/auth/register', { body: partner }).catch(() =>
  api('/auth/login', { body: partner }),
);
const server = await api('/servers', {
  body: { name: `Polish ${suffix}` },
  token: ownerAuth.accessToken,
});
const second = await api(`/servers/${server.id}/channels`, {
  body: { name: 'kho-tai-lieu' },
  token: ownerAuth.accessToken,
});
const invite = await api(`/servers/${server.id}`, { method: 'GET', token: ownerAuth.accessToken });
await api('/servers/join', {
  body: { inviteCode: invite.inviteCode },
  token: partnerAuth.accessToken,
});
const dm = await api('/dms', {
  body: { userId: partnerAuth.user.id },
  token: ownerAuth.accessToken,
});

const send = (channelId, content, token) =>
  api(`/channels/${channelId}/messages`, {
    body: { content, nonce: crypto.randomUUID() },
    token,
  });
const generalId = server.channels[0].id;
await send(generalId, `Họp nhóm lúc 9h về kế hoạch ${suffix}`, ownerAuth.accessToken);
await send(second.id, `Biên bản họp ${suffix} đã lưu vào kho tài liệu`, ownerAuth.accessToken);
const dmMessage = await send(
  dm.channelId,
  `Chào bạn, đây là tin nhắn DM ${suffix}.`,
  partnerAuth.accessToken,
);

const channelUrl = `${BASE}/servers/${server.id}/channels/${generalId}`;

await mkdir(OUT_T67, { recursive: true });
await mkdir(OUT_T68, { recursive: true });
const browser = await chromium.launch();

async function newPage(colorScheme) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    colorScheme,
    locale: 'vi-VN',
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log(`  [console] ${msg.text()}`);
  });
  await page.goto(`${BASE}/login`);
  await page.getByLabel('Email').filter({ visible: true }).fill(owner.email);
  await page.getByLabel('Mật khẩu').filter({ visible: true }).fill(owner.password);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await page.getByRole('link', { name: '# general' }).waitFor();
  await page.goto(channelUrl);
  await page.getByTestId('message-composer').waitFor();
  return { context, page };
}

const { context, page } = await newPage('dark');

await capture(
  page,
  OUT_T67,
  '01-channel-dark',
  async () => {
    await page.getByTestId('message-composer').waitFor();
    await page.getByText(`Họp nhóm lúc 9h về kế hoạch ${suffix}`).waitFor();
  },
  {
    verify: async () => {
      expectState(
        (await page.getByText(`Họp nhóm lúc 9h về kế hoạch ${suffix}`).count()) > 0,
        'chưa thấy tin nhắn trong kênh',
      );
    },
  },
);

await capture(
  page,
  OUT_T67,
  '02-quick-switcher-dark',
  async () => {
    await page.getByTestId('message-composer').waitFor();
    await page.keyboard.press('Control+k');
    await page.getByTestId('quick-switcher-input').waitFor();
    await page.locator('[role="dialog"]').waitFor();
  },
  {
    verify: async () => {
      expectState(
        await page
          .getByTestId('quick-switcher-input')
          .evaluate((el) => el === document.activeElement),
        'ô tìm kiếm chưa nhận focus',
      );
      expectState(
        (await page.getByTestId('quick-switcher-item').count()) > 0,
        'danh sách chuyển nhanh rỗng',
      );
    },
  },
);

await capture(
  page,
  OUT_T67,
  '03-quick-switcher-empty-dark',
  async () => {
    await page.getByTestId('quick-switcher-input').fill('khong-co-gi');
    await page.getByText('Không tìm thấy').waitFor();
  },
  {
    verify: async () => {
      expectState(
        (await page.getByTestId('quick-switcher-item').count()) === 0,
        'vẫn còn kết quả: không phải trạng thái rỗng',
      );
    },
  },
);
await page.keyboard.press('Escape');

await capture(
  page,
  OUT_T67,
  '04-search-results-dark',
  async () => {
    await page.getByRole('button', { name: 'Tìm trong server' }).click();
    const input = page.getByTestId('search-input');
    await input.waitFor();
    await input.fill(`bien ban hop ${suffix}`);
    await page.getByTestId('search-results').locator('li').first().waitFor();
  },
  {
    verify: async () => {
      expectState(
        (await page.getByTestId('search-results').locator('li').count()) > 0,
        'không có kết quả tìm kiếm trong ảnh',
      );
    },
  },
);
await page.keyboard.press('Escape');

await new Promise((resolve) => setTimeout(resolve, 65_000));

await capture(
  page,
  OUT_T67,
  '05-admin-settings-dark',
  async () => {
    // Trang quản trị cuộn trong khung riêng nên fullPage bị cắt: chụp ở khung cao.
    await page.setViewportSize({ width: 1280, height: 1600 });
    await page.goto(`${BASE}/servers/${server.id}/settings`);
    await page.getByRole('heading', { name: 'Cài đặt server' }).waitFor();
    await page.getByRole('table', { name: 'Vai trò' }).waitFor();
  },
  {
    verify: async () => {
      expectState(
        (await page.getByRole('table').count()) >= 2,
        'bảng quản trị chưa tải xong trong ảnh',
      );
      expectState(
        await page.getByRole('table', { name: 'Vai trò' }).isVisible(),
        'bảng vai trò không nằm trong khung ảnh',
      );
    },
  },
);

await capture(page, OUT_T67, '06-dm-thread-dark', async () => {
  await page.goto(`${BASE}/dms/${dm.channelId}`);
  await page.getByTestId('dm-header').waitFor();
  await page.getByText(`Chào bạn, đây là tin nhắn DM ${suffix}.`).waitFor();
});

await page.goto(channelUrl);
await page.getByTestId('message-composer').waitFor();

await capture(
  page,
  OUT_T68,
  '375-channel',
  async () => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.getByTestId('mobile-nav-toggle').waitFor();
    await page.waitForTimeout(SETTLE_MS);
  },
  {
    verify: async () => {
      expectState(
        await page.getByTestId('mobile-nav-toggle').isVisible(),
        'thanh trên 375 chưa hiện',
      );
      expectState(
        !(await page.getByRole('link', { name: '# general' }).isVisible()),
        'sidebar vẫn hiện ở 375 khi drawer đóng',
      );
    },
  },
);

await capture(
  page,
  OUT_T68,
  '375-drawer',
  async () => {
    await page.getByTestId('mobile-nav-toggle').click();
    await page.getByTestId('dm-rail').waitFor();
    await page.getByRole('link', { name: '# general' }).waitFor();
  },
  {
    verify: async () => {
      expectState(
        await page.getByRole('link', { name: '# general' }).isVisible(),
        'drawer chưa mở: không thấy sidebar',
      );
    },
  },
);
await page.keyboard.press('Escape');

await capture(
  page,
  OUT_T68,
  '768-channel',
  async () => {
    await page.setViewportSize({ width: 768, height: 900 });
    await page.getByRole('link', { name: '# general' }).waitFor();
    await page.waitForTimeout(SETTLE_MS);
  },
  {
    verify: async () => {
      expectState(
        await page.getByRole('link', { name: '# general' }).isVisible(),
        'sidebar chưa hiện ở 768',
      );
    },
  },
);

await capture(page, OUT_T68, '1280-channel', async () => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole('link', { name: '# general' }).waitFor();
  await page.waitForTimeout(SETTLE_MS);
});

await context.close();
// API giới hạn 100 request/phút/IP: đóng context tối, chờ cửa sổ trượt rồi mở context sáng.
await new Promise((resolve) => setTimeout(resolve, 65_000));

const light = await newPage('light');

await capture(light.page, OUT_T67, '07-channel-light', async () => {
  await light.page.getByTestId('message-composer').waitFor();
  await light.page.getByText(`Họp nhóm lúc 9h về kế hoạch ${suffix}`).waitFor();
});

await capture(light.page, OUT_T67, '08-quick-switcher-light', async () => {
  await light.page.getByTestId('message-composer').waitFor();
  await light.page.keyboard.press('Control+k');
  await light.page.getByTestId('quick-switcher-input').waitFor();
});

await capture(
  light.page,
  OUT_T67,
  '09-notify-prefs-error-light',
  async () => {
    await light.page.keyboard.press('Escape');
    await light.page.route('**/api/v1/users/me/notification-prefs**', (route) =>
      route.fulfill({
        status: 500,
        headers: { 'X-Request-Id': REQUEST_ID },
        json: { code: 'INTERNAL_ERROR', message: 'x', requestId: REQUEST_ID },
      }),
    );
    await light.page.goto(channelUrl);
    await light.page.getByTestId('message-composer').waitFor();
    await light.page.getByTestId('notify-bell').click();
    await light.page.getByText('Không tải được cài đặt thông báo.').waitFor();
  },
  {
    verify: async () => {
      expectState(
        (await light.page.getByText('Không tải được cài đặt thông báo.').count()) > 0,
        'không thấy lỗi tải prefs trong ảnh',
      );
    },
  },
);
await light.page.unrouteAll({ behavior: 'ignoreErrors' });
await light.context.close();

await browser.close();

await api(`/channels/${dm.channelId}/read`, {
  method: 'PUT',
  body: { messageId: dmMessage.id },
  token: ownerAuth.accessToken,
});
await api(`/servers/${server.id}`, { method: 'DELETE', token: ownerAuth.accessToken });

console.log(`\n${captured.length} ảnh: ${captured.join(', ')}`);
if (failed.length > 0) {
  console.log(`\n${failed.length} lỗi:`);
  for (const item of failed) console.log(` - ${item}`);
  process.exitCode = 1;
}
