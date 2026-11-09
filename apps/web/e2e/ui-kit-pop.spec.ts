import { expect, test } from '@playwright/test';
import { scan } from './axe';

// Bộ UI kit của skin Pop (ADR-0084): kho `/dev/ui` chứa mọi control `Ping*`; quét axe và chụp toàn
// trang ở cả hai nền để duyệt hình thức. Ảnh ghi vào test-results/skin-pop, KHÔNG phải baseline.
const SCHEMES = ['light', 'dark'] as const;

test('UI kit skin Pop: kho /dev/ui qua axe, sáng và tối', async ({ page, context, baseURL }) => {
  await context.addCookies([{ name: 'ping-skin', value: 'pop', url: baseURL! }]);
  for (const colorScheme of SCHEMES) {
    await page.emulateMedia({ colorScheme });
    await page.goto('/dev/ui');
    await expect(page.locator('html')).toHaveAttribute('data-skin', 'pop');
    await expect(page.getByRole('heading', { name: 'Nút và hành động' })).toBeVisible();
    await scan(page, `ui kit pop ${colorScheme}`);
    await page.screenshot({ path: `test-results/skin-pop/kit-${colorScheme}.png`, fullPage: true });
  }
});
