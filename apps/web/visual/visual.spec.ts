import { expect, test, type Page } from '@playwright/test';
import { pacedLogin } from '../e2e/login-pace';

const SERVER_ID = process.env.VISUAL_SERVER_ID!;
const CHANNEL_ID = process.env.VISUAL_CHANNEL_ID!;
const CITATION_ID = '0190a8f2-3c4d-7e8f-9a0b-1c2d3e4f5a6b';
const ASK_ANSWER = 'Theo lịch sử kênh, buổi họp diễn ra lúc 9 giờ.';

const VIEWPORTS = [
  { name: '375x812', width: 375, height: 812 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '1280x800', width: 1280, height: 800 },
] as const;
const SCHEMES = ['light', 'dark'] as const;

/** Ẩn thanh cuộn (Chromium Windows/Linux vẽ khác nhau) và `<time>` bằng visibility (giờ tương đối đổi theo lần chạy). */
async function stabilize(page: Page): Promise<void> {
  await page.waitForTimeout(800);
  await expect(page.getByText(/Đang kết nối…|Mất kết nối\. Đang thử/)).toHaveCount(0);
  await page.addStyleTag({
    content:
      '::-webkit-scrollbar{width:0!important;height:0!important} time{visibility:hidden!important}',
  });
  await page.evaluate(() => document.fonts.ready);
}

async function openChat(page: Page): Promise<void> {
  await page.goto(`/servers/${SERVER_ID}/channels/${CHANNEL_ID}`);
  await expect(page.getByTestId('message-scroll')).toBeVisible();
  await expect(page.getByText('Welcome to Ping! 🏓')).toBeVisible();
  await expect(page.getByTestId('ask-ai-button')).toBeVisible();
}

async function mockAsk(page: Page): Promise<void> {
  await page.route('**/api/v1/servers/*/ask', async (route) => {
    const origin = new URL(page.url()).origin;
    const headers = {
      'access-control-allow-origin': origin,
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'authorization,content-type,accept,x-ping-client',
      'access-control-allow-methods': 'POST,OPTIONS',
    };
    if (route.request().method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers });
      return;
    }
    const sse = [
      { type: 'meta', data: { retrievedChunks: 2, messageCount: 3 } },
      { type: 'delta', data: { text: 'Theo lịch sử kênh, ' } },
      { type: 'delta', data: { text: 'buổi họp diễn ra lúc 9 giờ.' } },
      { type: 'done', data: { citations: [CITATION_ID], model: 'mock' } },
    ]
      .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`)
      .join('');
    await route.fulfill({
      status: 200,
      headers: { ...headers, 'content-type': 'text/event-stream; charset=utf-8' },
      body: sse,
    });
  });
}

/** Đăng nhập qua API (context.request chia cookie với trang), không qua form: rate limit 10/phút. */
for (const viewport of VIEWPORTS) {
  for (const scheme of SCHEMES) {
    test.describe(`${scheme} ${viewport.name}`, () => {
      test.use({
        viewport: { width: viewport.width, height: viewport.height },
        colorScheme: scheme,
      });

      test('5 màn chính', async ({ page }) => {
        test.setTimeout(180_000);
        await pacedLogin(page.context().request, 'alice@ping.dev', 'password123');

        await openChat(page);
        await stabilize(page);
        await expect(page).toHaveScreenshot(`chat-${scheme}-${viewport.name}.png`);

        await page.getByRole('button', { name: 'Tìm trong server' }).click();
        const input = page.getByTestId('search-input');
        await expect(input).toBeVisible();
        await input.fill('Kênh');
        await expect(page.getByTestId('search-results')).toContainText(
          'Kênh #dev dành cho thảo luận kỹ thuật nhé.',
        );
        await stabilize(page);
        await expect(page).toHaveScreenshot(`search-${scheme}-${viewport.name}.png`);

        await page.goto('/settings/appearance');
        await expect(page.getByTestId('settings-appearance')).toBeVisible();
        await expect(page.getByTestId('settings-nav-appearance')).toHaveAttribute(
          'aria-current',
          'page',
        );
        // Chờ GET /users/me/settings đổ vào segmented, không thì ảnh chụp lúc chưa chọn mục nào.
        await expect(page.getByRole('radio', { name: 'Hệ thống' })).toBeChecked();
        await stabilize(page);
        await expect(page).toHaveScreenshot(`settings-${scheme}-${viewport.name}.png`);

        await page.goto(`/servers/${SERVER_ID}/settings`);
        await expect(page.getByRole('heading', { name: 'Cài đặt server' })).toBeVisible();
        await expect(page.getByRole('heading', { name: 'Danh mục' })).toBeVisible();
        await stabilize(page);
        await expect(page).toHaveScreenshot(`admin-${scheme}-${viewport.name}.png`);

        await mockAsk(page);
        await openChat(page);
        await page.getByTestId('ask-ai-button').click();
        await page.getByTestId('ask-input').fill('Họp lúc mấy giờ?');
        await page.getByTestId('ask-send').click();
        await expect(page.getByTestId('ask-answer')).toContainText(ASK_ANSWER);
        await expect(page.getByTestId(`ask-citation-${CITATION_ID}`)).toBeVisible();
        await stabilize(page);
        await expect(page).toHaveScreenshot(`ask-${scheme}-${viewport.name}.png`);
      });
    });
  }
}
