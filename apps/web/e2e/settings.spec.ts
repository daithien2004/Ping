import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { AuthResponse, NotificationPrefsResponse, UserSettingsDto } from '@ping/shared';
import { pacedLogin } from './login-pace';

const API = 'http://localhost:4000/api/v1';
const SEED_PASSWORD = 'password123';
// Ảnh evidence TG.13 — Playwright tự tạo thư mục cha khi ghi file.
const EVIDENCE_DIR = path.resolve(__dirname, '../../../docs/v0.2.0/evidence/TG.13');

const authHeaders = (auth: AuthResponse) => ({ Authorization: `Bearer ${auth.accessToken}` });

/** Đợi PATCH /users/me/settings trả 2xx khi bấm một lựa chọn trong trang cài đặt. */
const patchSettingsOk = (page: Page) =>
  page.waitForResponse(
    (res) =>
      res.url().includes('/users/me/settings') && res.request().method() === 'PATCH' && res.ok(),
  );

/**
 * TG.13 — trang cài đặt. Một luồng nối tiếp qua step (pacedLogin, workers=1):
 * - (a) mở /settings từ rail → đổi theme 'dark' → html[data-theme='dark'] NGAY; tab thứ hai
 *       (context riêng, đăng nhập lại) tải trang cũng tối — đồng bộ nhiều thiết bị;
 * - (b) Riêng tư: tắt "Nhận DM từ thành viên server" → PATCH /users/me/privacy xác nhận,
 *       bob tạo DM tới alice qua API → 403 DM_BLOCKED; danh sách chặn: bob block alice qua
 *       API → trang của bob hiện dòng + Bỏ chặn qua Popconfirm → dòng biến mất;
 * - (c) Thông báo: tạo override kênh bằng API (việc tạo thuộc chuông TG.12) → trang hiện
 *       dòng → đổi mức qua UI → GET prefs xác nhận; reset → dòng biến mất; toggle thiết bị
 *       "Bỏ qua @everyone"/âm thanh → localStorage đúng;
 * - (d) giá trị lạ bị từ chối: PATCH theme 'blue' → 400; UI chỉ cho chọn đúng 3 theme;
 * - (e) chụp 5 mục cài đặt (viewport 1440×900) vào docs/v0.2.0/evidence/TG.13/;
 * - (f) Ngôn ngữ: đổi 'en' → chữ UI đổi + reload giữ nguyên (chạy CUỐI vì đổi ngôn ngữ trang).
 */
test('tg13 settings: theme sync hai tab, riêng tư/chặn, thông báo kênh, giá trị lạ, evidence', async ({
  browser,
}) => {
  test.setTimeout(420_000);
  const aliceContext = await browser.newContext();
  const bobContext = await browser.newContext();
  // Lưu lại để finally phủi tay được cả khi test đỏ giữa chừng.
  let aliceForCleanup: AuthResponse | undefined;
  let bobForCleanup: AuthResponse | undefined;
  try {
    const alice = await pacedLogin(
      aliceContext.request,
      process.env.E2E_EMAIL!,
      process.env.E2E_PASSWORD!,
    );
    const bob = await pacedLogin(bobContext.request, 'bob@ping.dev', SEED_PASSWORD);
    aliceForCleanup = alice;
    bobForCleanup = bob;
    const alicePage = await aliceContext.newPage();

    await test.step('(a) mở /settings từ rail, đổi theme dark, tab hai nhận theme', async () => {
      await alicePage.goto('/');
      // '/' → landing thay '/servers' → server đầu tiên → kênh đầu: đợi URL ổn định rồi mới
      // bấm rail, không thì navigation của landing/server đè mất điều hướng sang /settings.
      await expect(alicePage.getByTestId('personal-settings-rail')).toBeVisible();
      await expect(alicePage).toHaveURL(/\/servers\/[0-9a-f-]+\/channels\/[0-9a-f-]+/, {
        timeout: 20_000,
      });
      // User e2e mới mỗi lần chạy: cài đặt là mặc định lazy (system) → không attr cưỡng bức.
      await expect(alicePage.locator('html')).toHaveAttribute('data-theme', 'system');

      await alicePage.getByTestId('personal-settings-rail').click();
      await expect(alicePage).toHaveURL(/\/settings$/);
      await expect(alicePage.getByTestId('settings-account')).toBeVisible();

      await alicePage.getByRole('link', { name: 'Giao diện' }).click();
      await expect(alicePage.getByTestId('settings-appearance')).toBeVisible();

      const done = patchSettingsOk(alicePage);
      await alicePage.getByTestId('settings-theme-dark').click();
      await done;
      // Áp dụng NGAY: attr trên <html> đổi trong cùng tick với bấm (optimistic store).
      await expect(alicePage.locator('html')).toHaveAttribute('data-theme', 'dark');
      // CSS cưỡng bức tối thực sự chạy: Playwright mặc định mô phỏng màu sáng (nền trắng) —
      // sau khi buộc tối, nền body phải rời màu trắng (so sánh lỏng để không phụ thuộc
      // định dạng màu trình duyệt trả về: oklch/lab/rgb).
      const background = await alicePage.evaluate(
        () => getComputedStyle(document.body).backgroundColor,
      );
      expect(background).not.toBe('rgb(255, 255, 255)');

      // GET API xác nhận đã lưu server.
      const saved = await aliceContext.request.get(`${API}/users/me/settings`, {
        headers: authHeaders(alice),
      });
      expect(((await saved.json()) as UserSettingsDto).theme).toBe('dark');
      // Segmented phải phản ánh đúng giá trị đã lưu (controlled từ cache settings) — chống
      // hồi quy "đổi xong nhưng lựa chọn hiển thị vẫn đứng ở giá trị cũ/mặc định".
      await expect(alicePage.getByRole('radio', { name: 'Tối' })).toBeChecked();

      // Tab thứ hai = context riêng (thiết bị khác): tải trang phải nhận theme từ server.
      const alice2Context = await browser.newContext();
      try {
        await pacedLogin(alice2Context.request, process.env.E2E_EMAIL!, process.env.E2E_PASSWORD!);
        const alice2Page = await alice2Context.newPage();
        await alice2Page.goto('/settings/appearance');
        await expect(alice2Page.getByTestId('settings-appearance')).toBeVisible();
        await expect(alice2Page.locator('html')).toHaveAttribute('data-theme', 'dark');
      } finally {
        await alice2Context.close();
      }
    });

    await test.step('(b) riêng tư: tắt dmAllow → bob tạo DM 403 DM_BLOCKED; chặn/bỏ chặn', async () => {
      await alicePage.getByRole('link', { name: 'Riêng tư' }).click();
      await expect(alicePage.getByTestId('settings-privacy')).toBeVisible();

      const privacyDone = alicePage.waitForResponse(
        (res) =>
          res.url().includes('/users/me/privacy') && res.request().method() === 'PATCH' && res.ok(),
      );
      await alicePage.getByTestId('settings-dm-allow').click();
      await privacyDone;
      await expect(alicePage.getByTestId('settings-dm-allow')).not.toBeChecked();

      // Tải lại: GET /users/me/privacy phải trả giá trị đã lưu, switch không nhảy về mặc định.
      await alicePage.reload();
      await expect(alicePage.getByTestId('settings-privacy')).toBeVisible();
      await expect(alicePage.getByTestId('settings-dm-allow')).not.toBeChecked();

      // bob chưa từng có DM với alice (user e2e mới mỗi run) → POST /dms chạm điều kiện dmAllow.
      const blocked = await bobContext.request.post(`${API}/dms`, {
        headers: authHeaders(bob),
        data: { userId: alice.user.id },
      });
      expect(blocked.status()).toBe(403);
      expect(((await blocked.json()) as { code: string }).code).toBe('DM_BLOCKED');

      // Danh sách chặn: bob block alice qua API → trang của bob hiện dòng + nút Bỏ chặn.
      const block = await bobContext.request.post(`${API}/users/${alice.user.id}/block`, {
        headers: authHeaders(bob),
      });
      expect(block.ok()).toBeTruthy();
      const bobPage = await bobContext.newPage();
      await bobPage.goto('/settings/privacy');
      const row = bobPage.getByTestId(`settings-blocked-row-${alice.user.id}`);
      await expect(row).toBeVisible();
      await expect(row).toContainText(`@${alice.user.username}`);

      await bobPage.getByTestId(`settings-unblock-${alice.user.id}`).click();
      // Popconfirm: nút xác nhận nằm trong lớp popover của antd (tránh trùng nút mở).
      await bobPage.locator('.ant-popover').getByRole('button', { name: 'Bỏ chặn' }).click();
      await expect(row).toHaveCount(0);
      await bobPage.close();

      // Trả dmAllow về mặc định cho các spec chạy sau.
      const restore = await aliceContext.request.patch(`${API}/users/me/privacy`, {
        headers: authHeaders(alice),
        data: { dmAllow: 'server_members' },
      });
      expect(restore.ok()).toBeTruthy();
    });

    await test.step('(c) thông báo: đổi mức kênh qua UI, localStorage của thiết bị', async () => {
      const channelId = process.env.E2E_CHANNEL_ID!;
      // Tạo dòng override bằng API (tạo override thuộc chuông kênh TG.12); trang này cho ĐỔI.
      const seed = await aliceContext.request.put(
        `${API}/users/me/notification-prefs/channel/${channelId}`,
        { headers: authHeaders(alice), data: { level: 'all', mutedUntil: null } },
      );
      expect(seed.ok()).toBeTruthy();

      await alicePage.getByRole('link', { name: 'Thông báo' }).click();
      await expect(alicePage.getByTestId('settings-notifications')).toBeVisible();
      // Prefs đã bị fetch từ lúc boot (hook realtime TG.12, staleTime 30s) nên cache còn dữ
      // liệu cũ "chưa có override" — tải lại trang để đọc trạng thái server sau khi seed.
      await alicePage.reload();
      const row = alicePage.getByTestId(`settings-channel-row-${channelId}`);
      await expect(row).toBeVisible();

      const putDone = alicePage.waitForResponse(
        (res) =>
          res.url().includes(`/users/me/notification-prefs/channel/${channelId}`) &&
          res.request().method() === 'PUT' &&
          res.ok(),
      );
      await row.getByTestId(`settings-channel-level-${channelId}-mentions`).click();
      await putDone;

      const prefs = await aliceContext.request.get(`${API}/users/me/notification-prefs`, {
        headers: authHeaders(alice),
      });
      const found = ((await prefs.json()) as NotificationPrefsResponse).prefs.find(
        (item) => item.scope === 'channel' && item.targetId === channelId,
      );
      expect(found?.level).toBe('mentions');

      // Reset về mặc định server: dòng override biến mất khỏi trang.
      const resetDone = alicePage.waitForResponse(
        (res) =>
          res.url().includes(`/users/me/notification-prefs/channel/${channelId}`) &&
          res.request().method() === 'DELETE' &&
          res.ok(),
      );
      await row.getByTestId(`settings-channel-reset-${channelId}`).click();
      await resetDone;
      await expect(row).toHaveCount(0);

      // Cài đặt THIẾT BỊ (localStorage): bỏ qua @everyone và âm thanh.
      await alicePage.getByTestId('settings-ignore-everyone').click();
      await expect
        .poll(() => alicePage.evaluate(() => localStorage.getItem('ping.notify.ignore-everyone')))
        .toBe('true');
      await alicePage.getByTestId('settings-sound').click();
      await expect
        .poll(() => alicePage.evaluate(() => localStorage.getItem('ping.notify.sound')))
        .toBe('false');
    });

    await test.step('(d) giá trị không hợp lệ bị từ chối', async () => {
      // PATCH trực tiếp giá trị lạ → API 400 (tiêu chí nghiệm thu TG.13).
      const invalid = await aliceContext.request.patch(`${API}/users/me/settings`, {
        headers: authHeaders(alice),
        data: { theme: 'blue' },
      });
      expect(invalid.status()).toBe(400);

      // UI không cho chọn giá trị lạ: segmented theme chỉ có đúng 3 lựa chọn của shared.
      await alicePage.getByRole('link', { name: 'Giao diện' }).click();
      await expect(alicePage.getByTestId('settings-appearance')).toBeVisible();
      await expect(alicePage.locator('[data-testid^="settings-theme-"]')).toHaveCount(3);
    });

    await test.step('(e) chụp evidence 5 mục (1440×900)', async () => {
      // Dữ liệu cho ảnh có nội dung: alice chặn bob, kênh #long có override.
      await aliceContext.request.post(`${API}/users/${bob.user.id}/block`, {
        headers: authHeaders(alice),
      });
      await aliceContext.request.put(
        `${API}/users/me/notification-prefs/channel/${process.env.E2E_CHANNEL_ID}`,
        { headers: authHeaders(alice), data: { level: 'mentions', mutedUntil: null } },
      );

      const shots = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      try {
        await pacedLogin(shots.request, process.env.E2E_EMAIL!, process.env.E2E_PASSWORD!);
        const page = await shots.newPage();
        const shoot = async (url: string, file: string, ready: string) => {
          await page.goto(url);
          await expect(page.getByTestId(ready)).toBeVisible();
          // Chờ trạng thái ổn định cho ảnh: theme server (dark, đặt ở bước a) đã áp dụng lên
          // <html> và rail tải xong — không thì ảnh có thể dính khung hình chuyển tiếp lúc nạp.
          await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
          await expect(page.getByTestId('self-avatar')).toBeVisible();
          await page.waitForTimeout(400); // đợi chuyển động CSS lắng lại cho ảnh ổn định
          await page.screenshot({ path: path.join(EVIDENCE_DIR, file) });
        };
        await shoot('/settings', 'settings-account.png', 'settings-account');
        await shoot('/settings/appearance', 'settings-appearance.png', 'settings-appearance');
        await shoot(
          '/settings/notifications',
          'settings-notifications.png',
          'settings-notifications',
        );
        await shoot('/settings/privacy', 'settings-privacy.png', 'settings-privacy');
        await shoot('/settings/shortcuts', 'settings-shortcuts.png', 'settings-shortcuts');
      } finally {
        await shots.close();
      }

      // Dữ liệu ảnh được phủi tay: bỏ chặn, gỡ override kênh.
      await aliceContext.request.delete(`${API}/users/${bob.user.id}/block`, {
        headers: authHeaders(alice),
      });
      await aliceContext.request.delete(
        `${API}/users/me/notification-prefs/channel/${process.env.E2E_CHANNEL_ID}`,
        { headers: authHeaders(alice) },
      );
    });

    await test.step('(f) ngôn ngữ: đổi en, reload giữ nguyên (chạy cuối vì đổi chữ)', async () => {
      await alicePage.getByRole('link', { name: 'Ngôn ngữ' }).click();
      await expect(alicePage.getByTestId('settings-language')).toBeVisible();

      const localeDone = patchSettingsOk(alicePage);
      await alicePage.getByTestId('settings-locale-en').click();
      await localeDone;
      // PATCH xong app ghi cookie rồi reload — chữ UI sang tiếng Anh, <html lang> đổi theo.
      await expect(alicePage.getByRole('link', { name: 'Appearance' })).toBeVisible({
        timeout: 15_000,
      });
      await expect(alicePage.locator('html')).toHaveAttribute('lang', 'en');

      // Reload lần nữa vẫn giữ nguyên (cookie là nguồn của i18n, server settings là nguồn sync).
      await alicePage.reload();
      await expect(alicePage.getByRole('link', { name: 'Appearance' })).toBeVisible();
      await expect(alicePage.getByTestId('settings-language')).toBeVisible();
    });
  } finally {
    // Phủi tay trạng thái đã đổi để chạy lại và các spec sau không dính (kể cả khi đỏ giữa
    // chừng): theme/locale về mặc định, dmAllow về mặc định, gỡ chặn hai chiều còn sót.
    if (aliceForCleanup && bobForCleanup) {
      await aliceContext.request
        .patch(`${API}/users/me/settings`, {
          headers: authHeaders(aliceForCleanup),
          data: { theme: 'system', locale: 'vi' },
        })
        .catch(() => {});
      await aliceContext.request
        .patch(`${API}/users/me/privacy`, {
          headers: authHeaders(aliceForCleanup),
          data: { dmAllow: 'server_members' },
        })
        .catch(() => {});
      await aliceContext.request
        .delete(`${API}/users/${bobForCleanup.user.id}/block`, {
          headers: authHeaders(aliceForCleanup),
        })
        .catch(() => {});
      await aliceContext.request
        .delete(`${API}/users/me/notification-prefs/channel/${process.env.E2E_CHANNEL_ID}`, {
          headers: authHeaders(aliceForCleanup),
        })
        .catch(() => {});
      await bobContext.request
        .delete(`${API}/users/${aliceForCleanup.user.id}/block`, {
          headers: authHeaders(bobForCleanup),
        })
        .catch(() => {});
    }
    await aliceContext.close().catch(() => {});
    await bobContext.close().catch(() => {});
  }
});
