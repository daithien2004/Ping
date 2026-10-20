import { expect, test } from '@playwright/test';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const WS = API.replace(/^http/, 'ws');

declare global {
  interface Window {
    __csp: string[];
    __xss?: number;
  }
}

// ADR-0027: header bảo mật + CSP. Chạy bằng app thật nên đồng thời chứng minh app KHÔNG bị CSP làm hỏng.
test('security headers are present and the app runs without CSP violations or script injection', async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (event) => {
      window.__csp.push(
        `${event.violatedDirective} ← ${event.blockedURI} @ ${event.sourceFile}:${event.lineNumber}:${event.columnNumber} ${event.sample}`,
      );
    });
  });

  const response = await page.goto('/login');
  const headers = response!.headers();
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['permissions-policy']).toContain('camera=()');

  const csp = headers['content-security-policy']!;
  for (const directive of [
    "default-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    `connect-src 'self' ${API} ${WS}`,
  ]) {
    expect(csp, directive).toContain(directive);
  }
  expect(csp).not.toMatch(/(script|connect|default)-src[^;]*\*/); // không wildcard

  await page.getByLabel('Email').filter({ visible: true }).fill(process.env.E2E_EMAIL!);
  await page.getByLabel('Mật khẩu').filter({ visible: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  // Đợi đăng nhập xong rồi mới đi tiếp: goto ngay sau khi bấm sẽ hủy request đăng nhập đang bay.
  await expect(page.getByRole('link', { name: '# general' })).toBeVisible();
  await page.goto(`/servers/${process.env.E2E_SERVER_ID}/channels/${process.env.E2E_CHANNEL_ID}`);
  // Các spec khác đã thêm tin vào #long nên #300 không còn ở đáy: chờ ô soạn tin thay vì một tin cụ thể.
  await expect(page.getByRole('textbox', { name: 'Nhắn #long' })).toBeVisible();

  // Nội dung tin nhắn là văn bản thuần: thẻ HTML hiện nguyên văn và không chạy.
  const payload = `<img src=x onerror="window.__xss=1"> <script>window.__xss=2</script>`;
  const composer = page.getByRole('textbox', { name: 'Nhắn #long' });
  await composer.fill(payload);
  await composer.press('Enter');
  await expect(
    page.locator('article:visible', { hasText: '<script>window.__xss=2</script>' }),
  ).toBeVisible();
  expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  expect(await page.locator('article:visible img').count()).toBe(0);

  expect(await page.evaluate(() => window.__csp)).toEqual([]);
});
