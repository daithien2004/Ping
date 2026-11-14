import { expect, test } from '@playwright/test';

const VIEWPORTS = [
  { name: '375x812', width: 375, height: 812 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '1280x800', width: 1280, height: 800 },
] as const;
const SCHEMES = ['light', 'dark'] as const;

test.use({ storageState: { cookies: [], origins: [] } });

for (const viewport of VIEWPORTS) {
  for (const scheme of SCHEMES) {
    test.describe(`${scheme} ${viewport.name}`, () => {
      test.use({
        viewport: { width: viewport.width, height: viewport.height },
        colorScheme: scheme,
      });

      test('login', async ({ page }) => {
        await page.goto('/login');
        await expect(page.getByRole('heading', { name: 'Đăng nhập' })).toBeVisible();
        await expect(page.getByLabel('Email')).toBeVisible();
        await page.addStyleTag({
          content: '::-webkit-scrollbar{width:0!important;height:0!important}',
        });
        await page.evaluate(() => document.fonts.ready);
        await expect(page).toHaveScreenshot(`login-${scheme}-${viewport.name}.png`);
      });
    });
  }
}
