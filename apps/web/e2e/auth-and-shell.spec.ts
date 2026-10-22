import { randomUUID } from 'node:crypto';
import { expect, type Page, test } from '@playwright/test';

// F2 + F3: một user mới đi trọn luồng, các bước phụ thuộc nhau nên chạy nối tiếp trên một trang.
test.describe.configure({ mode: 'serial' });

const id = randomUUID().slice(0, 8);
const email = `e2e-ui-${id}@example.test`;
const password = 'e2e-password';

// <Activity> giữ trang đã rời (form /register, dialog đóng…) ẩn trong DOM: chỉ lấy ô đang hiện.
const field = (page: Page, label: string) => page.getByLabel(label).filter({ visible: true });

test('register, sign out without ?next=, sign in, create server and channel', async ({ page }) => {
  await test.step('đăng ký → màn hình chưa có server', async () => {
    await page.goto('/register');
    await field(page, 'Email').fill(email);
    await field(page, 'Tên người dùng').fill(`e2e_ui_${id}`);
    await field(page, 'Mật khẩu').fill(password);
    await page.getByRole('button', { name: 'Tạo tài khoản' }).click();
    await expect(page.getByRole('heading', { name: 'Bạn chưa ở trong server nào' })).toBeVisible();
  });

  await test.step('tạo server → vào #general', async () => {
    await page.getByRole('button', { name: 'Tạo server' }).first().click();
    // Wizard onboarding: nút mở wizard và nút gửi trong wizard trùng tên → bám theo dialog.
    const wizard = page.getByRole('dialog');
    await field(page, 'Tên server').fill(`UI ${id}`);
    await wizard.getByRole('button', { name: 'Tạo server' }).click();
    await expect(page.getByRole('link', { name: '# general' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  await test.step('tạo channel → vào channel mới', async () => {
    await page.getByRole('button', { name: 'Tạo channel' }).click();
    await field(page, 'Tên channel').fill('ui-test');
    await page.getByRole('button', { name: 'Tạo', exact: true }).click();
    await expect(page.getByRole('link', { name: '# ui-test' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });

  await test.step('tự đăng xuất → /login KHÔNG kèm ?next= (ADR-0019)', async () => {
    await page.getByRole('button', { name: 'Thoát' }).click();
    await expect(page).toHaveURL(/\/login$/);
    // Người sau trên cùng trình duyệt không được thấy (kể cả trong DOM ẩn) trang của người trước.
    await expect(page.getByRole('link', { name: '# ui-test', includeHidden: true })).toHaveCount(0);
  });

  await test.step('đăng nhập lại → về server đã tạo', async () => {
    await field(page, 'Email').fill(email);
    await field(page, 'Mật khẩu').fill(password);
    await page.getByRole('button', { name: 'Đăng nhập' }).click();
    await expect(page.getByRole('link', { name: '# ui-test' })).toBeVisible();
    // Form đăng nhập/đăng ký bị giấu, không bị gỡ: mật khẩu không được nằm lại trong DOM.
    const leftover = await page
      .locator('input[type=password]')
      .evaluateAll((inputs) => inputs.filter((i) => (i as HTMLInputElement).value !== '').length);
    expect(leftover).toBe(0);
  });
});
