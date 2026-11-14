import { randomUUID } from 'node:crypto';
import { expect, type Page, test } from '@playwright/test';
import type { ChannelDto } from '@ping/shared';
import { paceLogin, pacedLogin } from './login-pace';

const API = 'http://localhost:4000/api/v1';

async function signIn(page: Page) {
  await paceLogin();
  await page.goto('/login');
  await page.getByLabel('Email').filter({ visible: true }).fill(process.env.E2E_EMAIL!);
  await page.getByLabel('Mật khẩu').filter({ visible: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page.getByRole('link', { name: '# general' })).toBeVisible();
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test('a channel with no messages says so', async ({ page, request }) => {
  const { accessToken } = await pacedLogin(
    request,
    process.env.E2E_EMAIL!,
    process.env.E2E_PASSWORD!,
  );
  const channel = (await (
    await request.post(`${API}/servers/${process.env.E2E_SERVER_ID}/channels`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      data: { name: `empty-${randomUUID().slice(0, 6)}` },
    })
  ).json()) as ChannelDto;

  await signIn(page);
  await page.goto(`/channels/${process.env.E2E_SERVER_ID}/${channel.id}`);
  await expect(page.getByText('Chưa có tin nhắn nào. Hãy gửi tin đầu tiên!')).toBeVisible();
  await expect(page.getByText(`Đây là đầu kênh #${channel.name}.`)).toBeVisible();
  await page.getByRole('button', { name: 'Gửi tin đầu tiên' }).click();
  await expect(page.getByRole('textbox', { name: `Nhắn #${channel.name}` })).toBeFocused();
});

test('a slow message list shows a skeleton (announced as busy) and then the messages', async ({
  page,
}) => {
  await signIn(page);
  await page.route('**/api/v1/channels/*/messages**', async (route) => {
    if (route.request().method() === 'GET') await delay(1500);
    await route.continue();
  });
  await page.goto(`/channels/${process.env.E2E_SERVER_ID}/${process.env.E2E_CHANNEL_ID}`);

  const skeleton = page.getByRole('status', { name: 'Đang tải tin nhắn…' });
  await expect(skeleton).toBeVisible();
  await expect(skeleton).toHaveAttribute('aria-busy', 'true');
  await expect(page.getByRole('textbox', { name: 'Nhắn #long' })).toBeVisible();
  await expect(skeleton).toHaveCount(0);
});

test('a slow channel list shows a sidebar skeleton instead of a blank column', async ({ page }) => {
  await signIn(page);
  // Init script xoá cache TRƯỚC khi QueryClient dựng: xoá bằng evaluate thua race với lần ghi cache hoãn 500 ms.
  await page.addInitScript(() => localStorage.removeItem('ping:query-cache'));
  await page.route('**/api/v1/servers/*/channels', async (route) => {
    await delay(1500);
    await route.continue();
  });
  await page.goto(`/channels/${process.env.E2E_SERVER_ID}/${process.env.E2E_CHANNEL_ID}`);

  await expect(page.getByRole('status', { name: 'Đang tải danh sách channel…' })).toBeVisible();
  await expect(page.getByRole('link', { name: '# long' })).toBeVisible();
});

test('a slow member list shows a skeleton (announced as busy) and then the members', async ({
  page,
}) => {
  await signIn(page);
  await page.route('**/api/v1/servers/*/members**', async (route) => {
    await delay(1500);
    await route.continue();
  });
  await page.goto(`/channels/${process.env.E2E_SERVER_ID}/${process.env.E2E_CHANNEL_ID}`);

  const skeleton = page.getByRole('status', { name: 'Đang tải thành viên…' });
  await expect(skeleton).toBeVisible();
  await expect(skeleton).toHaveAttribute('aria-busy', 'true');
  await expect(skeleton).toHaveCount(0);
  await expect(page.getByRole('complementary', { name: 'Thành viên' })).toBeVisible();
});
