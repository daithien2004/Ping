import { expect, test } from '@playwright/test';

test('đổi ngôn ngữ: lưu vào cookie, đổi tại chỗ không tải lại, nhãn và <html lang> đổi theo', async ({
  page,
}) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Đăng nhập' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi');

  await page.evaluate(() => Reflect.set(window, '__pingNoReload', true));

  await page.getByRole('radio', { name: 'English' }).check({ force: true });
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByLabel('Password').filter({ visible: true })).toBeVisible();

  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText(/Invalid/i).first()).toBeVisible();

  await page.getByRole('radio', { name: 'Tiếng Việt' }).check({ force: true });
  await expect(page.getByRole('heading', { name: 'Đăng nhập' })).toBeVisible();
  expect(await page.evaluate(() => Reflect.get(window, '__pingNoReload') === true)).toBe(true);
});
