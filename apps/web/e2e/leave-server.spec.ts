import { expect, type Page, test } from '@playwright/test';
import { paceLogin } from './login-pace';

// Tìm ra bằng test tay (2026-11-06): rời server sang /dms thì layout `servers/[serverId]` bị
// <Activity> giữ ẩn, `useParams()` trong đó trả serverId = undefined và web gọi
// GET /servers/undefined và /servers/undefined/channels (400). ADR-0020, bản sửa 2026-11-06.
const channelUrl = () =>
  `/servers/${process.env.E2E_SERVER_ID!}/channels/${process.env.E2E_CHANNEL_ID!}`;
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
  await page.goto(channelUrl());
  await expect(composer(page)).toBeVisible();

  // Điều hướng phía client (không reload): layout của server vẫn được giữ ẩn khi sang /dms.
  await page.getByTestId('dm-rail').click();
  await expect(page).toHaveURL(/\/dms$/);
  await expect(page.getByText('Tin nhắn trực tiếp').first()).toBeVisible();

  await page.getByRole('link', { name: /^E2E / }).first().click();
  await expect(page).toHaveURL(/\/servers\//);
  await page.getByTestId('dm-rail').click();
  await expect(page).toHaveURL(/\/dms$/);
  // Cho các query lỗi (nếu có) kịp phát request trước khi kết luận.
  await page.waitForTimeout(1500);

  expect(bad, 'request tới /servers/undefined').toEqual([]);
});
