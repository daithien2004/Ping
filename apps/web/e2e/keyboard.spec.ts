import { expect, type Page, test } from '@playwright/test';
import { paceLogin } from './login-pace';

// H4 (ADR-0029): dùng được hoàn toàn bằng bàn phím — mở hộp thoại, focus vào ô nhập, Esc đóng và
// trả focus về nút đã mở, mở menu thao tác tin nhắn.
async function signIn(page: Page) {
  await paceLogin();
  await page.goto('/login');
  await page.getByLabel('Email').filter({ visible: true }).fill(process.env.E2E_EMAIL!);
  await page.getByLabel('Mật khẩu').filter({ visible: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page.getByRole('link', { name: '# general' })).toBeVisible();
}

// Một lần đăng nhập cho cả hai kịch bản (đăng nhập bị giới hạn 5 lần/phút/IP).
test('keyboard: dialog focus in and back, message menu', async ({ page }) => {
  await signIn(page);
  const createButton = page.getByRole('button', { name: 'Tạo server' });
  await createButton.focus();
  await page.keyboard.press('Enter');

  const dialog = page.getByRole('dialog', { name: 'Tạo server' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('textbox')).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(createButton).toBeFocused();

  await page.goto(`/servers/${process.env.E2E_SERVER_ID}/channels/${process.env.E2E_CHANNEL_ID}`);
  const menuButton = page.getByRole('button', { name: 'Thao tác tin nhắn' }).last();
  await menuButton.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menuitem', { name: 'Sửa' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menuitem', { name: 'Sửa' })).toHaveCount(0);
});
