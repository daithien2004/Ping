import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

// Menu modal Radix đặt aria-hidden lên phần còn lại nhưng phần đó vẫn focusable → aria-hidden-focus; chỉ quét `only`.
// Đợi hết chuyển động hữu hạn: màu giữa chừng làm contrast "đỏ" lúc có lúc không.
async function settleAnimations(page: Page) {
  await page.waitForFunction(
    () =>
      document
        .getAnimations()
        .every((animation) => animation.effect?.getComputedTiming().iterations === Infinity),
    undefined,
    { timeout: 5000 },
  );
}

/** SSR luôn dựng bảng màu sáng; quét trước khi `<html data-theme>` xuất hiện sẽ báo color-contrast giả. */
async function settleTheme(page: Page) {
  await page.waitForFunction(() => {
    const root = document.documentElement;
    if (!root.hasAttribute('data-theme')) return false;
    // `emulateMedia` đổi prefers-color-scheme, nhưng antd dựng lại bảng màu ở nhịp React sau
    // đó; chờ `data-theme-mode` (chế độ đã áp) khớp trước khi đo màu.
    if (root.getAttribute('data-theme') !== 'system') return true;
    const mode = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    return root.getAttribute('data-theme-mode') === mode;
  });
}

export async function scan(page: Page, what: string, only?: string) {
  await settleTheme(page);
  // Gỡ transition ngay sau khi quét: để nguyên sẽ chặn animation vào của menu mở sau đó (antd chờ animationend).
  const freeze = await page.addStyleTag({
    content: '*,*::before,*::after{transition:none!important}',
  });
  let summary: string[] = [];
  try {
    await settleAnimations(page);
    const builder = new AxeBuilder({ page }).withTags(TAGS);
    const { violations } = await (only ? builder.include(only) : builder).analyze();
    summary = violations.map(
      (v) =>
        `${v.id} (${v.impact}): ${v.help} → ${v.nodes
          .slice(0, 3)
          .map((n) => `${n.target.join(' ')} [${n.any[0]?.message ?? ''}]`)
          .join(' | ')}`,
    );
  } finally {
    await freeze.evaluate((node) => (node as Element).remove());
  }
  expect(summary, what).toEqual([]);
}
