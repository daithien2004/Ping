import path from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { AuthResponse, NotificationPrefsResponse, UserSettingsDto } from '@ping/shared';
import { pacedLogin } from './login-pace';

const API = 'http://localhost:4000/api/v1';
const SEED_PASSWORD = 'password123';
const EVIDENCE_DIR = path.resolve(__dirname, '../../../docs/v0.2.0/evidence/TG.13');

const authHeaders = (auth: AuthResponse) => ({ Authorization: `Bearer ${auth.accessToken}` });

const patchSettingsOk = (page: Page) =>
  page.waitForResponse(
    (res) =>
      res.url().includes('/users/me/settings') && res.request().method() === 'PATCH' && res.ok(),
  );

test('tg13 settings: theme sync hai tab, riêng tư/chặn, thông báo kênh, giá trị lạ, evidence', async ({
  browser,
}) => {
  test.setTimeout(420_000);
  const aliceContext = await browser.newContext();
  const bobContext = await browser.newContext();
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

    await test.step('(a) mở cài đặt (modal) từ panel người dùng, đổi theme dark, tab hai nhận theme', async () => {
      await alicePage.goto('/');
      // Đợi URL ổn định (landing → server → kênh) trước khi bấm: navigation của landing/server đè mất.
      await expect(alicePage.getByTestId('personal-settings')).toBeVisible();
      await expect(alicePage).toHaveURL(/\/channels\/[0-9a-f-]+\/[0-9a-f-]+/, {
        timeout: 20_000,
      });
      await expect(alicePage.locator('html')).toHaveAttribute('data-theme', 'system');

      await alicePage.getByTestId('personal-settings').click();
      await expect(alicePage.getByTestId('settings-account')).toBeVisible();
      await expect(alicePage).toHaveURL(/\/channels\/[0-9a-f-]+\/[0-9a-f-]+/);

      await alicePage.getByTestId('settings-modal-nav-appearance').click();
      await expect(alicePage.getByTestId('settings-appearance')).toBeVisible();

      const done = patchSettingsOk(alicePage);
      await alicePage.getByTestId('settings-theme-dark').click();
      await done;
      await expect(alicePage.locator('html')).toHaveAttribute('data-theme', 'dark');
      const background = await alicePage.evaluate(
        () => getComputedStyle(document.body).backgroundColor,
      );
      expect(background).not.toBe('rgb(255, 255, 255)');

      const saved = await aliceContext.request.get(`${API}/users/me/settings`, {
        headers: authHeaders(alice),
      });
      expect(((await saved.json()) as UserSettingsDto).theme).toBe('dark');
      await expect(alicePage.getByRole('radio', { name: 'Tối' })).toBeChecked();

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
      await alicePage.getByTestId('settings-modal-nav-privacy').click();
      await expect(alicePage.getByTestId('settings-privacy')).toBeVisible();

      const privacyDone = alicePage.waitForResponse(
        (res) =>
          res.url().includes('/users/me/privacy') && res.request().method() === 'PATCH' && res.ok(),
      );
      await alicePage.getByTestId('settings-dm-allow').click();
      await privacyDone;
      await expect(alicePage.getByTestId('settings-dm-allow')).not.toBeChecked();

      await alicePage.reload();
      await alicePage.getByTestId('personal-settings').click();
      await alicePage.getByTestId('settings-modal-nav-privacy').click();
      await expect(alicePage.getByTestId('settings-privacy')).toBeVisible();
      await expect(alicePage.getByTestId('settings-dm-allow')).not.toBeChecked();

      const blocked = await bobContext.request.post(`${API}/dms`, {
        headers: authHeaders(bob),
        data: { userId: alice.user.id },
      });
      expect(blocked.status()).toBe(403);
      expect(((await blocked.json()) as { code: string }).code).toBe('DM_BLOCKED');

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
      await bobPage.locator('.ant-popover').getByRole('button', { name: 'Bỏ chặn' }).click();
      await expect(row).toHaveCount(0);
      await bobPage.close();

      const restore = await aliceContext.request.patch(`${API}/users/me/privacy`, {
        headers: authHeaders(alice),
        data: { dmAllow: 'server_members' },
      });
      expect(restore.ok()).toBeTruthy();
    });

    await test.step('(c) thông báo: đổi mức kênh qua UI, localStorage của thiết bị', async () => {
      const channelId = process.env.E2E_CHANNEL_ID!;
      const seed = await aliceContext.request.put(
        `${API}/users/me/notification-prefs/channel/${channelId}`,
        { headers: authHeaders(alice), data: { level: 'all', mutedUntil: null } },
      );
      expect(seed.ok()).toBeTruthy();

      await alicePage.getByTestId('settings-modal-nav-notifications').click();
      await expect(alicePage.getByTestId('settings-notifications')).toBeVisible();
      // Prefs đã fetch từ lúc boot (staleTime 30s): tải lại để đọc trạng thái server sau seed.
      await alicePage.reload();
      await alicePage.getByTestId('personal-settings').click();
      await alicePage.getByTestId('settings-modal-nav-notifications').click();
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

      const resetDone = alicePage.waitForResponse(
        (res) =>
          res.url().includes(`/users/me/notification-prefs/channel/${channelId}`) &&
          res.request().method() === 'DELETE' &&
          res.ok(),
      );
      await row.getByTestId(`settings-channel-reset-${channelId}`).click();
      await resetDone;
      await expect(row).toHaveCount(0);

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
      const invalid = await aliceContext.request.patch(`${API}/users/me/settings`, {
        headers: authHeaders(alice),
        data: { theme: 'blue' },
      });
      expect(invalid.status()).toBe(400);

      await alicePage.getByTestId('settings-modal-nav-appearance').click();
      await expect(alicePage.getByTestId('settings-appearance')).toBeVisible();
      await expect(alicePage.locator('[data-testid^="settings-theme-"]')).toHaveCount(3);
    });

    await test.step('(e) chụp evidence 5 mục (1440×900)', async () => {
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
          // Chờ theme dark đã áp lên html và rail tải xong: không thì ảnh dính khung chuyển tiếp.
          await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
          await expect(page.getByTestId('self-avatar')).toBeVisible();
          await page.waitForTimeout(400);
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

      await aliceContext.request.delete(`${API}/users/${bob.user.id}/block`, {
        headers: authHeaders(alice),
      });
      await aliceContext.request.delete(
        `${API}/users/me/notification-prefs/channel/${process.env.E2E_CHANNEL_ID}`,
        { headers: authHeaders(alice) },
      );
    });

    await test.step('(f) ngôn ngữ: đổi en, reload giữ nguyên (chạy cuối vì đổi chữ)', async () => {
      await alicePage.getByTestId('settings-modal-nav-language').click();
      await expect(alicePage.getByTestId('settings-language')).toBeVisible();

      const localeDone = patchSettingsOk(alicePage);
      await alicePage.getByTestId('settings-locale-en').click();
      await localeDone;
      await expect(alicePage.getByTestId('settings-modal-nav-appearance')).toHaveText(
        /Appearance/,
        { timeout: 15_000 },
      );
      await expect(alicePage.locator('html')).toHaveAttribute('lang', 'en');

      await alicePage.reload();
      await alicePage.getByTestId('personal-settings').click();
      await expect(alicePage.getByTestId('settings-modal-nav-appearance')).toHaveText(/Appearance/);
      await alicePage.getByTestId('settings-modal-nav-language').click();
      await expect(alicePage.getByTestId('settings-language')).toBeVisible();
    });
  } finally {
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
