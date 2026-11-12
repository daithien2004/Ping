import { expect, type Page, test } from '@playwright/test';
import { paceLogin, pacedLogin } from './login-pace';

// Tìm ra bằng test tay (2026-11-06): rời server sang DM thì layout `servers/[serverId]` bị
// <Activity> giữ ẩn và mã cũ đọc id bằng `useParams()` (trả undefined khi ẩn) → web gọi
// GET /servers/undefined và /servers/undefined/channels (400). Bản sửa 2026-11-06 (ADR-0020);
// nay id đọc từ pathname công khai (`lib/channel-url.ts`, ADR-0088) nên cũng phải không gọi bừa.
const channelUrl = () => `/channels/${process.env.E2E_SERVER_ID!}/${process.env.E2E_CHANNEL_ID!}`;
const composer = (page: Page) => page.locator('[data-testid="message-composer"]:visible');

async function signIn(page: Page) {
  await paceLogin();
  await page.goto('/login');
  await page.getByLabel('Email').filter({ visible: true }).fill(process.env.E2E_EMAIL!);
  await page.getByLabel('Mật khẩu').filter({ visible: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(composer(page)).toBeVisible({ timeout: 45_000 });
}

test('rời server sang tin nhắn trực tiếp (và quay lại) không gọi API với serverId undefined', async ({
  page,
}) => {
  const bad: string[] = [];
  page.on('request', (request) => {
    if (/\/(servers|channels)\/(undefined|null)(\/|$|\?)/.test(request.url()))
      bad.push(request.url());
  });

  await signIn(page);
  // URL cũ vẫn vào đúng trang qua chuyển hướng 308 (ADR-0088).
  await page.goto(`/servers/${process.env.E2E_SERVER_ID}/channels/${process.env.E2E_CHANNEL_ID}`);
  await expect(page).toHaveURL(
    new RegExp(`/channels/${process.env.E2E_SERVER_ID}/${process.env.E2E_CHANNEL_ID}$`),
  );
  await page.goto('/dms');
  await expect(page).toHaveURL(/\/channels\/@me$/);
  await page.goto(channelUrl());
  await expect(composer(page)).toBeVisible();

  // Điều hướng phía client (không reload): layout của server vẫn được giữ ẩn khi sang DM.
  await page.getByTestId('dm-rail').click();
  await expect(page).toHaveURL(/\/channels\/@me$/);
  await expect(page.getByText('Tin nhắn trực tiếp').first()).toBeVisible();

  await page.getByRole('link', { name: /^E2E / }).first().click();
  await expect(page).toHaveURL(/\/channels\//);
  await page.getByTestId('dm-rail').click();
  await expect(page).toHaveURL(/\/channels\/@me$/);
  // Cho các query lỗi (nếu có) kịp phát request trước khi kết luận.
  await page.waitForTimeout(1500);

  expect(bad, 'request tới /servers/undefined').toEqual([]);
});

// Race thấy trên CI (admin-invite: "Tham gia" xong URL vẫn ở server cũ): người dùng bấm sang server B
// khi trang gốc `/servers/A` còn chờ danh sách kênh. Điều hướng sang B chưa commit nên URL vẫn là A;
// nếu danh sách kênh của A về lúc đó, ChannelRedirect của A gọi router.replace(kênh của A) và lần
// điều hướng sau này thắng → người dùng bị kéo ngược về A. Ở đây B chuyển chậm (3 giây), kênh của A về trước.
// FIXME (docs/tech-debt.md): lỗi có thật và có sẵn từ trước ADR-0020 amendment; test đỏ trên cả
// code cũ lẫn mới. Bỏ `.fixme` khi sửa ChannelRedirect không đè lên điều hướng đang chờ.
test.fixme('chuyển sang server khác khi trang gốc server cũ vừa nhận kênh: không bị kéo ngược về', async ({
  browser,
}) => {
  const API = 'http://localhost:4000/api/v1';
  const serverA = process.env.E2E_SERVER_ID!;
  const context = await browser.newContext();
  try {
    const auth = await pacedLogin(
      context.request,
      process.env.E2E_EMAIL!,
      process.env.E2E_PASSWORD!,
    );
    const headers = { Authorization: `Bearer ${auth.accessToken}` };
    const created = await context.request.post(`${API}/servers`, {
      headers,
      data: { name: `Race ${Date.now().toString(36)}` },
    });
    expect(created.ok()).toBeTruthy();
    const serverB = (await created.json()) as { id: string; name: string };

    try {
      const page = await context.newPage();
      const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
      // Danh sách kênh của A về sau ~1,5 giây; tải trang B (RSC/document) về sau 3 giây.
      await page.route(`**/api/v1/servers/${serverA}/channels`, async (route) => {
        await delay(1_500);
        await route.continue();
      });
      await page.route(new RegExp(`localhost:3000/channels/${serverB.id}`), async (route) => {
        await delay(3_000);
        await route.continue();
      });
      await page.goto(`/channels/${serverA}`);
      await page.getByRole('link', { name: serverB.name }).click();

      // Chờ quá cả hai độ trễ: URL phải kết thúc ở B, không bị kéo về kênh của A.
      await page.waitForTimeout(6_000);
      await expect(page).toHaveURL(new RegExp(`/channels/${serverB.id}`));
    } finally {
      await context.request.delete(`${API}/servers/${serverB.id}`, { headers });
    }
  } finally {
    await context.close();
  }
});
