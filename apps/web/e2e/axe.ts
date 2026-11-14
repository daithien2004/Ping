import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';

// Dùng chung cho các spec a11y (H4, hướng dẫn 16.8, ADR-0029): một bộ luật axe, một cách
// đợi theme/animation. Violation nào cũng làm test đỏ: sửa app/token, đừng nới bộ luật.
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

// `only`: vùng cần quét. Menu modal của Radix đặt aria-hidden lên phần còn lại của trang nhưng phần
// đó vẫn focusable trên DOM (focus bị bẫy bên trong menu) → axe báo aria-hidden-focus; chỉ quét menu.
// axe đọc màu tính toán tại thời điểm quét: ngay sau khi đổi nền sáng/tối hoặc mở menu/hộp thoại, các chuyển động CSS
// (transition màu, animate-in) còn chạy dở nên màu ở giữa chừng làm contrast "đỏ" lúc có lúc không (đã gặp trên CI
// và ở màn Tài khoản: đo được #625d60 trên #2a2a2e ≈ 2,2:1 trong lúc chuyển tiếp, màu cuối vẫn đạt).
// Đợi hết chuyển động hữu hạn rồi mới quét.
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

/**
 * SSR luôn dựng bảng màu sáng (server không biết `prefers-color-scheme`); `<html data-theme>`
 * chỉ xuất hiện sau khi ThemeProvider chạy effect ở client. Quét trước mốc đó, axe đo chữ antd
 * màu sáng trên bề mặt đã tối (đỏ #c20000 trên #222327 ≈ 2,6:1) và báo color-contrast giả.
 */
async function settleTheme(page: Page) {
  await page.waitForFunction(() => document.documentElement.hasAttribute('data-theme'));
}

export async function scan(page: Page, what: string, only?: string) {
  await settleTheme(page);
  // Tắt transition màu đúng lúc quét (transition đang chạy có thể khởi động lại do click/hover
  // ngay trước axe đọc màu). Gỡ ngay sau khi quét: để nguyên sẽ chặn animation vào của menu mở
  // sau đó (antd chờ animationend nên mục menu kẹt ở trạng thái ẩn).
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
