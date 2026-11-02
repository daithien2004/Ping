import { expect, test } from '@playwright/test';
import { SKIN_COOKIE } from '../src/lib/theme/skin';

const VIEWPORTS = [
  { name: '375x812', width: 375, height: 812 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '1280x800', width: 1280, height: 800 },
] as const;
const SCHEMES = ['light', 'dark'] as const;
// ADR-0076: ảnh mặc định giữ tên cũ; ảnh Pixel thêm hậu tố `-pixel`.
const SKINS = ['default', 'pixel'] as const;

// Màn đăng nhập phải ở trạng thái chưa đăng nhập, ngược với `visual.spec.ts`.
test.use({ storageState: { cookies: [], origins: [] } });

for (const viewport of VIEWPORTS) {
  for (const scheme of SCHEMES) {
    test.describe(`${scheme} ${viewport.name}`, () => {
      test.use({
        viewport: { width: viewport.width, height: viewport.height },
        colorScheme: scheme,
      });

      for (const skin of SKINS) {
        const suffix = skin === 'default' ? '' : `-${skin}`;
        test(`login${skin === 'default' ? '' : ' (skin Pixel)'}`, async ({ page, baseURL }) => {
          await page.context().addCookies([{ name: SKIN_COOKIE, value: skin, url: baseURL! }]);
          await page.goto('/login');
          await expect(page.getByRole('heading', { name: 'Đăng nhập' })).toBeVisible();
          await expect(page.getByLabel('Email')).toBeVisible();
          await expect(page.locator('html')).toHaveAttribute('data-skin', skin);
          await page.addStyleTag({
            content: '::-webkit-scrollbar{width:0!important;height:0!important}',
          });
          await page.evaluate(() => document.fonts.ready);
          await expect(page).toHaveScreenshot(`login-${scheme}-${viewport.name}${suffix}.png`);
        });
      }
    });
  }
}
