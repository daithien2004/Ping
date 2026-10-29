import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { findMailToken } from './global-setup';
import { paceLogin, pacedLogin } from './login-pace';

/**
 * TG.8 — vòng đời tài khoản trên web. Ba test độc lập chạy nối tiếp (workers=1):
 *  (a) đăng ký → tạo server bị chặn VERIFY_REQUIRED → lấy token verify từ Mailpit →
 *      /verify?token= thành công → tạo server được, banner chưa xác minh tắt;
 *  (b) quên mật khẩu alice: thông báo trung lập → token reset từ Mailpit → đổi mật khẩu →
 *      đăng nhập bằng mật khẩu mới → đổi NGƯỢC về password123 (form Đổi mật khẩu);
 *  (c) phiên đăng nhập: danh sách ≥1 dòng, dòng hiện tại đánh dấu; thu hồi từng phiên và
 *      «thu hồi các phiên khác» — phiên bị thu hồi reload là về /login.
 *
 * Login đi qua pacedLogin/paceLogin (rate limit 10/phút/IP); register 5/phút/IP nên mỗi lần
 * chạy chỉ đăng ký đúng 1 user mới (test a). Mailpit đọc qua API 8025, lọc theo người nhận.
 */
const API = 'http://localhost:4000/api/v1';
const SEED_PASSWORD = 'password123';
const ALICE = 'alice@ping.dev';

// <Activity> giữ trang đã rời (form ẩn) trong DOM: chỉ lấy ô đang hiện.
const field = (page: Page, label: string) =>
  page.getByLabel(label, { exact: true }).filter({ visible: true });

/** Đợi một request đúng method + path trả 2xx rồi trả response (bấm nút phải nằm sau). */
const waitForOk = (page: Page, path: string, method: string) =>
  page.waitForResponse(
    (res) => res.url().includes(path) && res.request().method() === method && res.ok(),
  );

/**
 * Chờ token từ Mailpit (thư đến hơi trễ sau register/forgot); đỏ nếu quá 30s không có.
 * `since` = mốc thời gian TRƯỚC khi gửi yêu cầu: bỏ qua thư cũ của lần chạy trước (alice
 * nhận thư reset nhiều lần) — nếu không, poller trả token cũ đã dùng ngay khi thư mới chưa tới.
 */
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
    // me.emailVerified=false → banner ở đầu app shell; sau verify sẽ tắt (đối chiếu cuối test).
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
  let alicePassword = SEED_PASSWORD; // theo vết để finally phủi tay nếu đỏ giữa chừng
  let forgotAt = 0; // mốc lọc thư reset, gán khi bấm gửi (dùng ở step sau nên nằm ngoài step)

  try {
    await test.step('từ /login bấm «Quên mật khẩu?» → gửi email alice', async () => {
      await page.goto('/login');
      await page.getByRole('link', { name: 'Quên mật khẩu?' }).click();
      await expect(page).toHaveURL(/\/forgot-password$/);
      await field(page, 'Email').fill(ALICE);
      forgotAt = Date.now(); // chỉ nhận thư reset gửi SAU thời điểm này
      const sent = waitForOk(page, '/auth/password/forgot', 'POST');
      await page.getByRole('button', { name: 'Gửi thư đặt lại mật khẩu' }).click();
      await sent;
      // Câu trung lập bất kể email có tồn tại (không lộ tài khoản nào đã đăng ký).
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
      await expect(page.getByTestId('personal-settings-rail')).toBeVisible();
      await expect(page).toHaveURL(/\/servers\/[0-9a-f-]+\/channels\//);
    });

    await test.step('đổi NGƯỢC về password123 qua form Đổi mật khẩu trong /settings', async () => {
      await page.getByTestId('personal-settings-rail').click();
      await expect(page).toHaveURL(/\/settings$/);
      await field(page, 'Mật khẩu hiện tại').fill(newPassword);
      await field(page, 'Mật khẩu mới').fill(SEED_PASSWORD);
      await field(page, 'Nhập lại mật khẩu mới').fill(SEED_PASSWORD);
      const patched = waitForOk(page, '/users/me/password', 'PATCH');
      await page.getByTestId('settings-change-password-submit').click();
      await patched;
      // Toast xác nhận + form được xoá (không giữ mật khẩu trong DOM).
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
    // Đỏ giữa chừng sau khi đã đổi mật khẩu: trả alice về password123 để các spec khác không dính.
    if (alicePassword !== SEED_PASSWORD) {
      await pacedLogin(page.context().request, ALICE, alicePassword)
        .then((auth) =>
          page.context().request.patch(`${API}/users/me/password`, {
            headers: { Authorization: `Bearer ${auth.accessToken}` },
            data: { currentPassword: alicePassword, password: SEED_PASSWORD },
          }),
        )
        .catch(() => {});
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
      // Cắt trạng thái cũ (các lần chạy trước để lại phiên trong DB): giữ duy nhất phiên này.
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
      // Dòng hiện tại không có nút thu hồi (không tự thu hồi phiên đang mở).
      await expect(page1.locator('[data-testid^="settings-session-revoke-"]')).toHaveCount(0);
    });

    await test.step('phiên thứ 2 (context riêng) xuất hiện → thu hồi → dòng biến mất', async () => {
      await pacedLogin(ctx2.request, ALICE, SEED_PASSWORD);
      const page2 = await ctx2.newPage();
      await page2.goto('/');
      await expect(page2.getByTestId('personal-settings-rail')).toBeVisible();

      const page1 = ctx1.pages()[0]!;
      // Tải lại để đọc danh sách mới (staleTime 30s — fetch lúc mở trang còn trước phiên 2).
      await page1.reload();
      const rows = page1.locator('[data-testid^="settings-session-row-"]');
      await expect(rows).toHaveCount(2);
      // Thiết bị của phiên 2 là Chrome e2e — cột thiết bị hiện nội dung, không rỗng.
      await expect(page1.getByTestId(/settings-session-row-/).last()).toContainText('Chrome');

      await page1.locator('[data-testid^="settings-session-revoke-"]').first().click();
      // Popconfirm: nút xác nhận nằm trong lớp popover của antd (tránh trùng nút mở).
      await page1.locator('.ant-popover').getByRole('button', { name: 'Thu hồi' }).click();
      await expect(rows).toHaveCount(1);
      await expect(page1.getByTestId('settings-session-current')).toBeVisible();

      // Phiên bị thu hồi reload → refresh 401 → AuthGate về /login.
      await page2.reload();
      await expect(page2).toHaveURL(/\/login(\?|$)/);
    });

    await test.step('«Thu hồi các phiên khác»: chỉ còn phiên hiện tại', async () => {
      await pacedLogin(ctx3.request, ALICE, SEED_PASSWORD);
      const page3 = await ctx3.newPage();
      await page3.goto('/');
      await expect(page3.getByTestId('personal-settings-rail')).toBeVisible();

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
