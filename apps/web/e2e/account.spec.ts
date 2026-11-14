import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { findMailToken } from './global-setup';
import { paceLogin, pacedLogin } from './login-pace';

const API = 'http://localhost:4000/api/v1';
const SEED_PASSWORD = 'password123';
const ALICE = 'alice@ping.dev';

const field = (page: Page, label: string) =>
  page.getByLabel(label, { exact: true }).filter({ visible: true });

const waitForOk = (page: Page, path: string, method: string) =>
  page.waitForResponse(
    (res) => res.url().includes(path) && res.request().method() === method && res.ok(),
    { timeout: 30_000 },
  );

/** `since` = mốc TRƯỚC khi gửi yêu cầu: bỏ qua thư cũ (alice nhận reset nhiều lần), không thì poller trả token đã dùng. */
async function pollMailToken(email: string, path: '/verify' | '/reset-password', since: number) {
  const deadline = Date.now() + 30_000;
  let token: string | undefined;
  while (!token && Date.now() < deadline) {
    token = await findMailToken(email, path, since);
    if (!token) await new Promise((resolve) => setTimeout(resolve, 500));
  }
  expect(token, `thư ${path} phải tới Mailpit trong 30s`).toBeTruthy();
  return token!;
}

test('(a) đăng ký → tạo server bị chặn vì chưa xác minh → verify qua Mailpit → tạo được', async ({
  page,
}) => {
  test.setTimeout(180_000);
  const id = randomUUID().slice(0, 8);
  const email = `e2e-tg8-${id}@example.test`;
  const password = 'e2e-password';
  const startedAt = Date.now();

  await test.step('đăng ký qua UI → banner chưa xác minh hiện', async () => {
    await page.goto('/register');
    await field(page, 'Email').fill(email);
    await field(page, 'Tên người dùng').fill(`e2e_tg8_${id}`);
    await field(page, 'Mật khẩu').fill(password);
    await page.getByRole('button', { name: 'Tạo tài khoản' }).click();
    await expect(page.getByRole('heading', { name: 'Bạn chưa ở trong server nào' })).toBeVisible();
    await expect(page.getByTestId('verify-email-banner')).toBeVisible();
  });

  await test.step('tạo server qua UI bị chặn VERIFY_REQUIRED', async () => {
    await page.getByRole('button', { name: 'Tạo server' }).first().click();
    const wizard = page.getByRole('dialog');
    await field(page, 'Tên server').fill(`TG8 ${id}`);
    const blocked = page.waitForResponse(
      (res) => res.url().includes('/servers') && res.request().method() === 'POST' && !res.ok(),
    );
    await wizard.getByRole('button', { name: 'Tạo server' }).click();
    const response = await blocked;
    expect(response.status()).toBe(403);
    expect(((await response.json()) as { code?: string }).code).toBe('VERIFY_REQUIRED');
    await expect(wizard.getByRole('alert')).toContainText('xác minh email');
  });

  await test.step('lấy token từ thư Mailpit → /verify?token= thành công', async () => {
    const token = await pollMailToken(email, '/verify', startedAt);
    await page.goto(`/verify?token=${token}`);
    await expect(page.getByTestId('verify-success')).toBeVisible();
  });

  await test.step('vào lại app: banner tắt, tạo server thành công', async () => {
    await page.goto('/');
    await expect(page.getByTestId('verify-email-banner')).toHaveCount(0);
    await page.getByRole('button', { name: 'Tạo server' }).first().click();
    const wizard = page.getByRole('dialog');
    await field(page, 'Tên server').fill(`TG8 ${id}`);
    const created = waitForOk(page, '/servers', 'POST');
    await wizard.getByRole('button', { name: 'Tạo server' }).click();
    await created;
    await expect(page.getByRole('link', { name: '# general' })).toBeVisible();
  });
});

test('(b) quên mật khẩu: thông báo trung lập → reset bằng token Mailpit → đổi lại mật khẩu cũ', async ({
  page,
}) => {
  test.setTimeout(300_000);
  const newPassword = `tg8-${randomUUID().slice(0, 8)}-Aa1`;
  let alicePassword = SEED_PASSWORD;
  let forgotAt = 0;

  try {
    await test.step('từ /login bấm «Quên mật khẩu?» → gửi email alice', async () => {
      await page.goto('/login');
      await page.getByRole('link', { name: 'Quên mật khẩu?' }).click();
      await expect(page).toHaveURL(/\/forgot-password$/);
      await field(page, 'Email').fill(ALICE);
      forgotAt = Date.now();
      const sent = waitForOk(page, '/auth/password/forgot', 'POST');
      await page.getByRole('button', { name: 'Gửi thư đặt lại mật khẩu' }).click();
      await sent;
      await expect(page.getByTestId('forgot-sent')).toBeVisible();
    });

    await test.step('lấy token reset từ Mailpit → đặt mật khẩu mới', async () => {
      const token = await pollMailToken(ALICE, '/reset-password', forgotAt);
      await page.goto(`/reset-password?token=${token}`);
      await field(page, 'Mật khẩu mới').fill(newPassword);
      await field(page, 'Nhập lại mật khẩu mới').fill(newPassword);
      const reset = waitForOk(page, '/auth/password/reset', 'POST');
      await page.getByRole('button', { name: 'Đặt lại mật khẩu' }).click();
      await reset;
      await expect(page.getByTestId('reset-success')).toBeVisible();
      alicePassword = newPassword;
    });

    await test.step('đăng nhập bằng mật khẩu mới (mọi phiên cũ đã bị thu hồi)', async () => {
      await page.getByTestId('reset-go-login').click();
      await expect(page).toHaveURL(/\/login$/);
      await paceLogin();
      await field(page, 'Email').fill(ALICE);
      await field(page, 'Mật khẩu').fill(newPassword);
      await page.getByRole('button', { name: 'Đăng nhập' }).click();
      await expect(page.getByTestId('personal-settings')).toBeVisible();
      await expect(page).toHaveURL(/\/channels\/[0-9a-f-]+\/[0-9a-f-]+/, { timeout: 30_000 });
    });

    await test.step('đổi NGƯỢC về password123 qua form Đổi mật khẩu trong modal cài đặt', async () => {
      await page.getByTestId('personal-settings').click();
      await expect(page.getByTestId('settings-account')).toBeVisible();
      await field(page, 'Mật khẩu hiện tại').fill(newPassword);
      await field(page, 'Mật khẩu mới').fill(SEED_PASSWORD);
      await field(page, 'Nhập lại mật khẩu mới').fill(SEED_PASSWORD);
      const patched = waitForOk(page, '/users/me/password', 'PATCH');
      await page.getByTestId('settings-change-password-submit').click();
      await patched;
      await expect(page.getByText('Đã đổi mật khẩu.').first()).toBeVisible();
      const leftover = await page
        .locator('[data-testid="settings-change-password"] input[type=password]')
        .evaluateAll((inputs) => inputs.filter((i) => (i as HTMLInputElement).value !== '').length);
      expect(leftover).toBe(0);
      alicePassword = SEED_PASSWORD;
    });

    await test.step('đối soát: password123 đăng nhập lại được qua API', async () => {
      const auth = await pacedLogin(page.context().request, ALICE, SEED_PASSWORD);
      expect(auth.user.email).toBe(ALICE);
    });
  } finally {
    if (alicePassword !== SEED_PASSWORD) {
      const request = page.context().request;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          // Bước đổi ngược có thể đã chạy trước khi timeout: thử mật khẩu seed trước.
          await pacedLogin(request, ALICE, SEED_PASSWORD);
          break;
        } catch {
          /* bỏ qua */
        }
        try {
          const auth = await pacedLogin(request, ALICE, alicePassword);
          const patched = await request.patch(`${API}/users/me/password`, {
            headers: { Authorization: `Bearer ${auth.accessToken}` },
            data: { currentPassword: alicePassword, password: SEED_PASSWORD },
          });
          if (patched.ok()) break;
        } catch {
          /* bỏ qua */
        }
        await new Promise((resolve) => setTimeout(resolve, 1_000 * (attempt + 1)));
      }
    }
  }
});

test('(c) phiên đăng nhập: danh sách, thu hồi từng phiên và thu hồi các phiên khác', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const ctx1 = await browser.newContext();
  const ctx2 = await browser.newContext();
  const ctx3 = await browser.newContext();
  try {
    await test.step('dọn phiên cũ của alice, mở /settings: đúng 1 dòng «Phiên này»', async () => {
      const alice = await pacedLogin(ctx1.request, ALICE, SEED_PASSWORD);
      const cleaned = await ctx1.request.delete(`${API}/users/me/sessions`, {
        headers: { Authorization: `Bearer ${alice.accessToken}` },
      });
      expect(cleaned.ok()).toBeTruthy();

      const page1 = await ctx1.newPage();
      await page1.goto('/settings');
      await expect(page1.getByTestId('settings-sessions')).toBeVisible();
      const rows = page1.locator('[data-testid^="settings-session-row-"]');
      await expect(rows).toHaveCount(1);
      await expect(page1.getByTestId('settings-session-current')).toBeVisible();
      await expect(page1.locator('[data-testid^="settings-session-revoke-"]')).toHaveCount(0);
    });

    await test.step('phiên thứ 2 (context riêng) xuất hiện → thu hồi → dòng biến mất', async () => {
      await pacedLogin(ctx2.request, ALICE, SEED_PASSWORD);
      const page2 = await ctx2.newPage();
      await page2.goto('/');
      await expect(page2.getByTestId('personal-settings')).toBeVisible();

      const page1 = ctx1.pages()[0]!;
      await page1.reload();
      const rows = page1.locator('[data-testid^="settings-session-row-"]');
      await expect(rows).toHaveCount(2);
      await expect(page1.getByTestId(/settings-session-row-/).last()).toContainText('Chrome');

      await page1.locator('[data-testid^="settings-session-revoke-"]').first().click();
      await page1.locator('.ant-popover').getByRole('button', { name: 'Thu hồi' }).click();
      await expect(rows).toHaveCount(1);
      await expect(page1.getByTestId('settings-session-current')).toBeVisible();

      await page2.reload();
      await expect(page2).toHaveURL(/\/login(\?|$)/);
    });

    await test.step('«Thu hồi các phiên khác»: chỉ còn phiên hiện tại', async () => {
      await pacedLogin(ctx3.request, ALICE, SEED_PASSWORD);
      const page3 = await ctx3.newPage();
      await page3.goto('/');
      await expect(page3.getByTestId('personal-settings')).toBeVisible();

      const page1 = ctx1.pages()[0]!;
      await page1.reload();
      const rows = page1.locator('[data-testid^="settings-session-row-"]');
      await expect(rows).toHaveCount(2);

      await page1.getByTestId('settings-revoke-other-sessions').click();
      await page1.locator('.ant-popover').getByRole('button', { name: 'Thu hồi' }).click();
      await expect(rows).toHaveCount(1);

      await page3.reload();
      await expect(page3).toHaveURL(/\/login(\?|$)/);
      await expect(page1.getByTestId('settings-session-current')).toBeVisible();
    });
  } finally {
    await ctx1.close().catch(() => {});
    await ctx2.close().catch(() => {});
    await ctx3.close().catch(() => {});
  }
});
