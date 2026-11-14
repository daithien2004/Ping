import { randomUUID } from 'node:crypto';
import { expect, type Page, test } from '@playwright/test';
import type { AuthResponse, ServerDetail } from '@ping/shared';
import { scan } from './axe';
import { paceLogin, pacedLogin } from './login-pace';

const API = 'http://localhost:4000/api/v1';

// Đăng nhập giới hạn 5 lần/phút/IP: mỗi file đăng nhập một lần, đổi nền sáng/tối bằng emulateMedia.

async function signIn(page: Page) {
  await paceLogin();
  await page.goto('/login');
  await page.getByLabel('Email').filter({ visible: true }).fill(process.env.E2E_EMAIL!);
  await page.getByLabel('Mật khẩu').filter({ visible: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page.getByRole('link', { name: '# general' })).toBeVisible();
}

const SCHEMES = ['light', 'dark'] as const;

test('login and register pages, light and dark', async ({ page }) => {
  for (const colorScheme of SCHEMES) {
    await page.emulateMedia({ colorScheme });
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Đăng nhập' })).toBeVisible();
    await scan(page, `login ${colorScheme}`);
    await page.goto('/register');
    await expect(page.getByRole('heading', { name: 'Tạo tài khoản' })).toBeVisible();
    await scan(page, `register ${colorScheme}`);
  }
});

test('error states, light and dark', async ({ page }) => {
  for (const colorScheme of SCHEMES) {
    await page.emulateMedia({ colorScheme });
    await page.goto('/khong-co-trang-nay');
    await expect(page.getByRole('heading', { name: 'Không tìm thấy trang' })).toBeVisible();
    await scan(page, `not found ${colorScheme}`);
  }
});

test('app shell with a channel, the message menu and the create-server dialog, light and dark', async ({
  page,
  request,
}) => {
  test.setTimeout(300_000);
  await signIn(page);
  await page.goto(`/channels/${process.env.E2E_SERVER_ID}/${process.env.E2E_CHANNEL_ID}`);
  await expect(page.getByRole('textbox', { name: 'Nhắn #long' })).toBeVisible();

  await expect(page.getByTestId('message-announcer')).toHaveAttribute('aria-live', 'polite');
  await expect(page.getByTestId('mention-announcer')).toHaveAttribute('aria-live', 'polite');

  for (const colorScheme of SCHEMES) {
    await page.emulateMedia({ colorScheme });
    await scan(page, `app shell ${colorScheme}`);

    const menuButton = page.getByRole('button', { name: 'Thao tác tin nhắn' }).last();
    await menuButton.locator('xpath=ancestor::article').hover();
    await menuButton.click();
    await expect(page.getByRole('menuitem', { name: 'Sửa' })).toBeVisible();
    await scan(page, `message actions menu ${colorScheme}`, '[role="menu"]');
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Tạo server' }).click();
    await expect(page.getByRole('dialog', { name: 'Bắt đầu với Ping' })).toBeVisible();
    await scan(page, `create-server dialog ${colorScheme}`);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }

  for (const colorScheme of SCHEMES) {
    await page.emulateMedia({ colorScheme });
    await page.keyboard.press('Control+k');
    const switcher = page.getByRole('dialog', { name: 'Chuyển nhanh' });
    await expect(switcher).toBeVisible();
    await expect(page.getByTestId('quick-switcher-input')).toBeFocused();
    await scan(page, `quick switcher ${colorScheme}`, '[role="dialog"]');
    await page.keyboard.press('Escape');
    await expect(switcher).toHaveCount(0);
  }

  for (const colorScheme of SCHEMES) {
    await page.emulateMedia({ colorScheme });
    await page.goto(`/servers/${process.env.E2E_SERVER_ID}/settings`);
    await expect(page.getByRole('heading', { name: 'Cài đặt server' })).toBeVisible();
    await scan(page, `admin settings ${colorScheme}`);
  }

  await page.goto(`/channels/${process.env.E2E_SERVER_ID}/${process.env.E2E_CHANNEL_ID}`);
  await expect(page.getByRole('textbox', { name: 'Nhắn #long' })).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  const toggle = page.getByTestId('mobile-nav-toggle');
  await expect(toggle).toBeVisible();
  for (const colorScheme of SCHEMES) {
    await page.emulateMedia({ colorScheme });
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await scan(page, `mobile drawer 375 ${colorScheme}`);
    await page.keyboard.press('Escape');
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  }
  await page.setViewportSize({ width: 768, height: 900 });
  // Dời chuột khỏi rail: tooltip mở trễ làm axe đo giữa lúc fade-in (đỏ lúc có lúc không).
  await page.mouse.move(700, 450);
  await expect(page.getByRole('tooltip')).toHaveCount(0);
  for (const colorScheme of SCHEMES) {
    await page.emulateMedia({ colorScheme });
    await scan(page, `shell 768 ${colorScheme}`);
  }
  await page.setViewportSize({ width: 1280, height: 900 });

  const auth = await pacedLogin(request, process.env.E2E_EMAIL!, process.env.E2E_PASSWORD!);
  const suffix = randomUUID().slice(0, 8);
  const partner = (await (
    await request.post(`${API}/auth/register`, {
      data: {
        email: `a11y-${suffix}@example.test`,
        username: `a11y_${suffix}`,
        password: 'e2e-password',
      },
    })
  ).json()) as AuthResponse;
  const headers = { Authorization: `Bearer ${auth.accessToken}` };
  const server = (await (
    await request.get(`${API}/servers/${process.env.E2E_SERVER_ID}`, { headers })
  ).json()) as ServerDetail;
  expect(
    (
      await request.post(`${API}/servers/join`, {
        headers: { Authorization: `Bearer ${partner.accessToken}` },
        data: { inviteCode: server.inviteCode },
      })
    ).ok(),
  ).toBeTruthy();
  const dm = (await (
    await request.post(`${API}/dms`, { headers, data: { userId: partner.user.id } })
  ).json()) as { channelId: string };
  await page.goto(`/channels/@me/${dm.channelId}`);
  await expect(page.getByTestId('dm-header')).toBeVisible({ timeout: 45_000 });
  for (const colorScheme of SCHEMES) {
    await page.emulateMedia({ colorScheme });
    await scan(page, `dm conversation ${colorScheme}`);
  }
});

test('personal settings sections, light and dark (TG.13)', async ({ page }) => {
  await signIn(page);
  const sections = [
    ['/settings', 'settings-account'],
    ['/settings/appearance', 'settings-appearance'],
    ['/settings/language', 'settings-language'],
    ['/settings/notifications', 'settings-notifications'],
    ['/settings/privacy', 'settings-privacy'],
    ['/settings/shortcuts', 'settings-shortcuts'],
  ] as const;
  for (const colorScheme of SCHEMES) {
    await page.emulateMedia({ colorScheme });
    for (const [url, testId] of sections) {
      await page.goto(url);
      await expect(page.getByTestId(testId)).toBeVisible();
      await scan(page, `${testId} ${colorScheme}`);
    }
  }
});
