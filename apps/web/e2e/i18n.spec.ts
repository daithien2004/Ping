import { expect, test } from '@playwright/test';

test('đổi ngôn ngữ: lưu vào cookie, đổi tại chỗ không tải lại, nhãn và <html lang> đổi theo', async ({
  page,
}) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Đăng nhập' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi');

  // Biến JS mất khi reload — còn sau khi đổi ngôn ngữ nghĩa là trang không tải lại.
  await page.evaluate(() => Reflect.set(window, '__pingNoReload', true));

  await page.getByRole('combobox', { name: 'Ngôn ngữ' }).selectOption('en');
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByLabel('Password').filter({ visible: true })).toBeVisible();

  // Lỗi validate của zod cũng theo ngôn ngữ đang chọn.
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText(/Invalid/i).first()).toBeVisible();

  await page.getByRole('combobox', { name: 'Language' }).selectOption('vi');
  await expect(page.getByRole('heading', { name: 'Đăng nhập' })).toBeVisible();
  expect(await page.evaluate(() => Reflect.get(window, '__pingNoReload') === true)).toBe(true);
});
