import { expect, test, type Page } from '@playwright/test';
import { paceLogin } from './login-pace';

// Phần A.2 của docs/perf/viec-con-lai-va-cuon-tin-nhan.md: PUT /read lỗi mạng một lần phải được
// gửi lại (và chỉ gửi lại một lần), thay vì bỏ mất mốc đã đọc tới khi có tin mới/remount.
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

test('PUT /read lỗi một lần thì tự gửi lại đúng một lần', async ({ page }) => {
  await signIn(page);

  let puts = 0;
  let fulfilled = 0;
  await page.route('**/api/v1/channels/*/read', async (route) => {
    puts += 1;
    if (puts === 1) {
      await route.abort('failed');
      return;
    }
    await route.continue();
  });
  page.on('response', (response) => {
    if (
      response.request().method() === 'PUT' &&
      response.url().includes('/read') &&
      response.status() === 204
    ) {
      fulfilled += 1;
    }
  });

  await page.goto(channelUrl());
  await expect(composer(page)).toBeVisible({ timeout: 45_000 });

  // Lần đầu bị huỷ, lần hai đi qua: tổng đúng 2 request, 1 thành công.
  await expect.poll(() => puts, { timeout: 15_000 }).toBe(2);
  await page.waitForTimeout(1_500);
  expect(puts, 'không thử lại quá một lần').toBe(2);
  expect(fulfilled, 'một PUT /read thành công').toBe(1);
});
