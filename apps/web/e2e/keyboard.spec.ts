import { expect, type Page, test } from '@playwright/test';
import { paceLogin } from './login-pace';

async function signIn(page: Page) {
  await paceLogin();
  await page.goto('/login');
  await page.getByLabel('Email').filter({ visible: true }).fill(process.env.E2E_EMAIL!);
  await page.getByLabel('Mật khẩu').filter({ visible: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page.getByRole('link', { name: '# general' })).toBeVisible();
}

test('keyboard: dialog focus in and back, message menu', async ({ page }) => {
  await signIn(page);
  const createButton = page.getByRole('button', { name: 'Tạo server' });
  await createButton.focus();
  await page.keyboard.press('Enter');

  const dialog = page.getByRole('dialog', { name: 'Bắt đầu với Ping' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('textbox')).toBeFocused();

  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(createButton).toBeFocused();

  await page.goto(`/channels/${process.env.E2E_SERVER_ID}/${process.env.E2E_CHANNEL_ID}`);
  const menuButton = page.getByRole('button', { name: 'Thao tác tin nhắn' }).last();
  // Quyền server làm mới ngầm sau khi vẽ từ cache nên thanh thao tác tạm disabled: chờ dùng được rồi mới focus.
  await expect(menuButton).toBeEnabled();
  await menuButton.focus();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('menuitem', { name: 'Sửa' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('menuitem', { name: 'Sửa' })).toHaveCount(0);
});
