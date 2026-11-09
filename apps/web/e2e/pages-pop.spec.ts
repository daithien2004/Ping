import { expect, test } from '@playwright/test';
import { scan } from './axe';
import { seedDemo, signInAs } from './pop-demo';

// Ảnh các trang thật với skin Pop để OWNER duyệt hình thức (test-results/skin-pop/pages), kèm axe.
// KHÔNG phải baseline visual regression. Đăng nhập một lần rồi đi qua từng trang.
const SCHEMES = ['light', 'dark'] as const;

test('skin Pop: các trang chính qua axe, ảnh sáng và tối', async ({
  page,
  context,
  baseURL,
  request,
}) => {
  test.setTimeout(300_000);
  await context.addCookies([{ name: 'ping-skin', value: 'pop', url: baseURL! }]);
  const shot = (name: string) =>
    page.screenshot({ path: `test-results/skin-pop/pages/${name}.png` });

  // Trang công khai (chưa đăng nhập).
  for (const colorScheme of SCHEMES) {
    await page.emulateMedia({ colorScheme });
    // Landing: toàn trang (hero, dải chữ chạy, tính năng, ba bước, kêu gọi, chân trang).
    await page.goto('/');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.getByText('Đang tải…')).toHaveCount(0, { timeout: 45_000 });
    await scan(page, `landing ${colorScheme}`);
    await page.screenshot({
      path: `test-results/skin-pop/pages/landing-${colorScheme}.png`,
      fullPage: true,
    });
    // Công tắc VI | EN: đổi sang English rồi về lại, nhóm radio theo kịp.
    await page.getByRole('radio', { name: 'English' }).check({ force: true });
    await expect(page.getByRole('radio', { name: 'English' })).toBeChecked();
    await page.getByRole('radio', { name: 'Tiếng Việt' }).check({ force: true });
    await expect(page.getByRole('radio', { name: 'Tiếng Việt' })).toBeChecked();

    await page.goto('/register');
    await expect(page.getByRole('heading', { name: 'Tạo tài khoản' })).toBeVisible();
    await scan(page, `register ${colorScheme}`);
    await shot(`register-${colorScheme}`);
    await page.goto('/forgot-password');
    await page.waitForTimeout(300);
    await scan(page, `forgot-password ${colorScheme}`);
    await shot(`forgot-password-${colorScheme}`);
    await page.goto('/khong-co-trang-nay');
    await expect(page.getByRole('heading', { name: 'Không tìm thấy trang' })).toBeVisible();
    await scan(page, `not-found ${colorScheme}`);
    await shot(`not-found-${colorScheme}`);
  }

  await page.emulateMedia({ colorScheme: 'light' });
  const demo = await seedDemo(request);
  await signInAs(page, demo);

  const pages: Array<[string, string, string?]> = [
    ['servers', '/servers'],
    ['server-home', `/servers/${demo.serverId}`],
    ['server-settings', `/servers/${demo.serverId}/settings`],
    ['settings-account', '/settings', 'settings-account'],
    ['settings-appearance', '/settings/appearance', 'settings-appearance'],
    ['settings-language', '/settings/language', 'settings-language'],
    ['settings-notifications', '/settings/notifications', 'settings-notifications'],
    ['settings-privacy', '/settings/privacy', 'settings-privacy'],
    ['settings-shortcuts', '/settings/shortcuts', 'settings-shortcuts'],
    ['dms', '/dms'],
  ];
  for (const colorScheme of SCHEMES) {
    await page.emulateMedia({ colorScheme });
    for (const [name, url, testId] of pages) {
      await page.goto(url);
      if (testId) await expect(page.getByTestId(testId)).toBeVisible();
      // Trang dev biên dịch lần đầu: đợi hết màn "Đang tải…" kẻo quét và chụp một trang rỗng.
      await expect(page.getByText('Đang tải…')).toHaveCount(0, { timeout: 45_000 });
      await page.waitForTimeout(500);
      await scan(page, `${name} ${colorScheme}`);
      await shot(`${name}-${colorScheme}`);
    }
  }

  // Màn "Đang tải…" toàn trang: làm chậm API để Suspense còn hiện đủ lâu mà chụp, rồi gỡ chặn.
  for (const colorScheme of SCHEMES) {
    await page.emulateMedia({ colorScheme });
    await page.route('**/api/v1/**', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 4000));
      await route.continue();
    });
    await page.goto('/settings', { waitUntil: 'commit' });
    await expect(page.locator('[data-slot="loading"]').first()).toBeVisible({ timeout: 20_000 });
    await shot(`loading-${colorScheme}`);
    await page.unroute('**/api/v1/**');
    await expect(page.getByTestId('settings-account')).toBeVisible({ timeout: 45_000 });
  }
});
