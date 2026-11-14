import { expect, type Page, test } from '@playwright/test';
import { paceLogin, pacedLogin } from './login-pace';

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
  await page.goto(`/servers/${process.env.E2E_SERVER_ID}/channels/${process.env.E2E_CHANNEL_ID}`);
  await expect(page).toHaveURL(
    new RegExp(`/channels/${process.env.E2E_SERVER_ID}/${process.env.E2E_CHANNEL_ID}$`),
  );
  await page.goto('/dms');
  await expect(page).toHaveURL(/\/channels\/@me$/);
  await page.goto(channelUrl());
  await expect(composer(page)).toBeVisible();

  await page.getByTestId('dm-rail').click();
  await expect(page).toHaveURL(/\/channels\/@me$/);
  await expect(page.getByText('Tin nhắn trực tiếp').first()).toBeVisible();

  await page.getByRole('link', { name: /^E2E / }).first().click();
  await expect(page).toHaveURL(/\/channels\//);
  await page.getByTestId('dm-rail').click();
  await expect(page).toHaveURL(/\/channels\/@me$/);
  await page.waitForTimeout(1500);

  expect(bad, 'request tới /servers/undefined').toEqual([]);
});

// Race thấy trên CI: điều hướng sang B chưa commit khi danh sách kênh của A về, ChannelRedirect của A router.replace và thắng.
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

      // Chờ quá cả hai độ trễ: URL phải kết thúc ở B.
      await page.waitForTimeout(6_000);
      await expect(page).toHaveURL(new RegExp(`/channels/${serverB.id}`));
    } finally {
      await context.request.delete(`${API}/servers/${serverB.id}`, { headers });
    }
  } finally {
    await context.close();
  }
});
