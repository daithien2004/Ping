import { expect, type Page, test } from '@playwright/test';
import { paceLogin } from './login-pace';

const field = (page: Page, label: string) => page.getByLabel(label).filter({ visible: true });

/**
 * Hồi quy cho ADR-0018: đăng xuất không được để request cũ (token đã bị xóa) ghi lỗi 401 vào
 * cache, rồi phiên đăng nhập sau ném lỗi đó qua Suspense thành `global-error`. Login lần hai
 * được làm chậm để request cũ có thời gian thất bại trước khi phiên mới được đặt.
 */
test('signing out and back in does not inherit the previous session query cache', async ({
  page,
}) => {
  test.setTimeout(60_000);

  await paceLogin();
  await page.goto('/login');
  await field(page, 'Email').fill(process.env.E2E_EMAIL!);
  await field(page, 'Mật khẩu').fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page.getByRole('link', { name: '# long' })).toBeVisible();

  await page.getByRole('button', { name: 'Thoát' }).click();
  await expect(page).toHaveURL(/\/login$/);

  await page.route('**/api/v1/auth/login', async (route) => {
    const response = await route.fetch();
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    await route.fulfill({ response });
  });
  await paceLogin();
  await field(page, 'Email').fill(process.env.E2E_EMAIL!);
  await field(page, 'Mật khẩu').fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();

  await expect(page.getByRole('link', { name: '# long' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Đã xảy ra lỗi nghiêm trọng' })).toHaveCount(0);
});
