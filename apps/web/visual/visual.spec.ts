import { expect, test, type Page } from '@playwright/test';
import { pacedLogin } from '../e2e/login-pace';
import { SKIN_COOKIE } from '../src/lib/theme/skin';

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
// ADR-0076: mỗi tổ hợp chụp hai lớp skin. Ảnh mặc định giữ nguyên tên cũ (chỉ đổi nội dung do
// PR1); ảnh Pixel thêm hậu tố `-pixel`. Skin đặt qua cookie trước lần tải trang đầu tiên.
const SKINS = ['default', 'pixel'] as const;

/**
 * Ổn định ảnh trước khi chụp:
 * - ẩn thanh cuộn (Chromium Windows/Linux vẽ khác nhau);
 * - ẩn `<time>` bằng `visibility` (giữ chỗ, không đổi layout) — giờ tương đối đổi theo lần
 *   chạy nên không thể đưa vào baseline, còn hộp mask màu tím che mất nội dung xung quanh;
 * - chờ font Geist tải xong;
 * - chờ handshake socket xong — banner "Đang kết nối…" xuất hiện ngay sau khi trang mount.
 */
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

/**
 * Chặn đúng route hỏi AI: nội dung SSE do test quyết định nên ảnh không phụ thuộc model.
 * Phần còn lại (auth, quyền, danh sách tin) vẫn chạy trên API thật.
 */
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

/**
 * 5 màn chính của app, chụp lần lượt trên cùng một phiên (một lần đăng nhập): chat, tìm kiếm,
 * cài đặt giao diện, quản trị server, ngăn kéo hỏi AI. `page.context().request` chia sẻ cookie với trang nên
 * đăng nhập qua API có hiệu lực ngay khi trang tải — không đi qua form (rate limit 10/phút).
 *
 * Mỗi tổ hợp kích thước × sáng/tối là một test và PHẢI đăng nhập phiên mới: refresh token
 * xoay vòng sau mỗi lần dùng, dùng lại cookie cũ bị coi là đánh cắp và thu hồi mọi phiên.
 * Baseline nằm trong `visual/__screenshots__`; cập nhật có chủ đích bằng
 * `pnpm --filter web test:visual:update` rồi xem lại ảnh diff trước khi commit.
 */
for (const viewport of VIEWPORTS) {
  for (const scheme of SCHEMES) {
    test.describe(`${scheme} ${viewport.name}`, () => {
      test.use({
        viewport: { width: viewport.width, height: viewport.height },
        colorScheme: scheme,
      });

      for (const skin of SKINS) {
        const suffix = skin === 'default' ? '' : `-${skin}`;
        test(`5 màn chính${skin === 'default' ? '' : ' (skin Pixel)'}`, async ({
          page,
          baseURL,
        }) => {
          test.setTimeout(180_000);
          // Đặt cookie trước lần tải trang đầu để store đọc đúng skin ngay khi hydrate.
          await page.context().addCookies([{ name: SKIN_COOKIE, value: skin, url: baseURL! }]);
          await pacedLogin(page.context().request, 'alice@ping.dev', 'password123');

          await openChat(page);
          await expect(page.locator('html')).toHaveAttribute('data-skin', skin);
          await stabilize(page);
          await expect(page).toHaveScreenshot(`chat-${scheme}-${viewport.name}${suffix}.png`);

          await page.getByRole('button', { name: 'Tìm trong server' }).click();
          const input = page.getByTestId('search-input');
          await expect(input).toBeVisible();
          await input.fill('Kênh');
          await expect(page.getByTestId('search-results')).toContainText(
            'Kênh #dev dành cho thảo luận kỹ thuật nhé.',
          );
          await stabilize(page);
          await expect(page).toHaveScreenshot(`search-${scheme}-${viewport.name}${suffix}.png`);

          await page.goto('/settings/appearance');
          await expect(page.getByTestId('settings-appearance')).toBeVisible();
          await expect(page.getByTestId('settings-nav-appearance')).toHaveAttribute(
            'aria-current',
            'page',
          );
          // Chờ GET /users/me/settings đổ vào segmented, không thì ảnh chụp lúc chưa chọn mục nào.
          await expect(page.getByRole('radio', { name: 'Hệ thống' })).toBeChecked();
          // Skin là lựa chọn thiết bị: ảnh Pixel phải cho thấy segmented cũng ở Pixel.
          const pixelRadio = page.getByRole('radio', { name: 'Pixel' });
          if (skin === 'pixel') await expect(pixelRadio).toBeChecked();
          else await expect(pixelRadio).not.toBeChecked();
          await stabilize(page);
          await expect(page).toHaveScreenshot(`settings-${scheme}-${viewport.name}${suffix}.png`);

          await page.goto(`/servers/${SERVER_ID}/settings`);
          await expect(page.getByRole('heading', { name: 'Cài đặt server' })).toBeVisible();
          await expect(page.getByRole('heading', { name: 'Danh mục' })).toBeVisible();
          await stabilize(page);
          await expect(page).toHaveScreenshot(`admin-${scheme}-${viewport.name}${suffix}.png`);

          await mockAsk(page);
          await openChat(page);
          await page.getByTestId('ask-ai-button').click();
          await page.getByTestId('ask-input').fill('Họp lúc mấy giờ?');
          await page.getByTestId('ask-send').click();
          await expect(page.getByTestId('ask-answer')).toContainText(ASK_ANSWER);
          await expect(page.getByTestId(`ask-citation-${CITATION_ID}`)).toBeVisible();
          await stabilize(page);
          await expect(page).toHaveScreenshot(`ask-${scheme}-${viewport.name}${suffix}.png`);
        });
      }
    });
  }
}
