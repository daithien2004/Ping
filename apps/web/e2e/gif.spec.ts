import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import type { GifDto, GifSearchResponse, ServerDetail } from '@ping/shared';
import { pacedLogin } from './login-pace';

const API = 'http://localhost:4000/api/v1';
// PNG nhỏ sinh cục bộ (cùng fixture với sticker.spec): mọi ảnh "Tenor" trong test được đáp từ
// buffer này qua page.route — bộ e2e KHÔNG phụ thuộc Tenor thật (ADR-0069), đồng thời chứng minh
// CSP `img-src` đã mở đúng origin https://media.tenor.com (CSP chặn trước khi route chạm mạng).
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAACgAAAAeCAIAAADRv8uKAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAN0lEQVRIie3VwQkAQAgDwe2/6VwZ3mPAvyAx0+pksjinnnDlnVIgU5lBIiyGxbA4LIbFsLivWHw+nauNqku18gAAAABJRU5ErkJggg==',
  'base64',
);

const gif = (id: string, width: number, height: number): GifDto => ({
  id,
  url: `https://media.tenor.com/${id}/tenor.gif`,
  width,
  height,
  provider: 'tenor',
});

const TRENDING = [gif('gif-trending-a', 200, 150), gif('gif-trending-b', 100, 100)];
const SEARCH_CAT = [gif('gif-cat-c', 300, 200)];

/**
 * Mock đúng phạm vi cần che (ADR-0069): cổng `/gifs/*` của backend (không phụ thuộc key/quota
 * Tenor của môi trường) và ảnh media.tenor.com. Gửi tin GIF đi API THẬT như sticker.spec —
 * URL mock thuộc host allowlist nên server nhận; ảnh trong tin được route đáp từ buffer.
 */
async function mockGifRoutes(page: Page) {
  await page.route('**/api/v1/gifs/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/gifs/search')) {
      const q = url.searchParams.get('q') ?? '';
      const body: GifSearchResponse = { gifs: q.includes('cat') ? SEARCH_CAT : [] };
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(body),
      });
      return;
    }
    const body: GifSearchResponse = { gifs: TRENDING };
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(body),
    });
  });
  // Ảnh "media.tenor.com" được đáp từ buffer cục bộ — không tải Tenor thật.
  await page.route('**/media.tenor.com/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: png }),
  );
}

/** Vùng danh sách tin của channel: <Activity> giữ trang cũ ẩn trong DOM nên lọc :visible. */
const paneOf = (page: Page, channel: string) =>
  page.locator(`[aria-label="Tin nhắn trong #${channel}"]:visible`);

/** Mở sticker picker (dynamic import lần đầu có thể chậm) rồi bật tab GIF, trả về locator picker. */
async function openGifTab(page: Page) {
  await page.getByTestId('sticker-button').click();
  const picker = page.getByTestId('sticker-picker');
  await expect(picker).toBeVisible({ timeout: 15_000 });
  await picker.getByRole('tab', { name: 'GIF', exact: true }).click();
  return picker;
}

// TG.25a+b (ADR-0069): tab GIF — trending grid hiện ảnh (mock /gifs/*), ghi công Tenor hiển thị,
// bấm GIF là GỬI ngay tin kind='gif' (không content) qua API thật, mục vừa bấm vào "Gần đây",
// tìm kiếm cập nhật grid theo q.
test('tab GIF: trending, ghi công, bấm-là-gửi, gần đây, tìm kiếm theo q', async ({ browser }) => {
  test.setTimeout(240_000);
  const alice = await browser.newContext();
  try {
    const auth = await pacedLogin(alice.request, 'alice@ping.dev', 'password123');
    const headers = { Authorization: `Bearer ${auth.accessToken}` };
    const suffix = randomUUID().slice(0, 8);
    // Server riêng cho test, xóa ở cuối — không đụng dữ liệu seed.
    const server = (await (
      await alice.request.post(`${API}/servers`, { headers, data: { name: `GIF ${suffix}` } })
    ).json()) as ServerDetail;
    const channel = server.channels[0]!;

    const page = await alice.newPage();
    await mockGifRoutes(page);
    await page.goto(`/servers/${server.id}/channels/${channel.id}`);
    await expect(page.getByTestId('message-composer')).toBeVisible({ timeout: 45_000 });

    await test.step('tab GIF: trending grid hiện ảnh + ghi công "GIFs by Tenor"', async () => {
      const picker = await openGifTab(page);
      const grid = picker.getByTestId('gif-grid');
      await expect(grid).toBeVisible({ timeout: 15_000 });
      await expect(grid.getByTestId('gif-option')).toHaveCount(TRENDING.length);
      const image = grid.getByTestId('gif-option').first().locator('img');
      await expect
        .poll(() => image.evaluate((node) => (node as HTMLImageElement).naturalWidth))
        .toBeGreaterThan(0);
      await expect(picker.getByTestId('gif-attribution').getByRole('link')).toHaveAttribute(
        'href',
        'https://tenor.com',
      );
    });

    await test.step('bấm GIF = gửi ngay: tin kind="gif" render ảnh, picker đóng', async () => {
      const picker = page.getByTestId('sticker-picker');
      await picker.getByTestId('gif-option').first().click();
      await expect(picker).toHaveCount(0); // chọn xong picker đóng
      const image = paneOf(page, channel.name).locator('article').last().getByTestId('gif-image');
      await expect(image).toBeVisible({ timeout: 15_000 });
      await expect(image).toHaveAttribute('src', TRENDING[0]!.url);
      await expect
        .poll(() => image.evaluate((node) => (node as HTMLImageElement).naturalWidth))
        .toBeGreaterThan(0);
    });

    await test.step('tab "Gần đây" trong GIF: mục vừa bấm lưu theo user', async () => {
      const picker = await openGifTab(page);
      const recent = picker.getByTestId('gif-recent');
      await expect(recent).toBeVisible({ timeout: 15_000 });
      await expect(recent.getByTestId('gif-option')).toHaveCount(1);
      await expect(recent.locator('img').first()).toHaveAttribute('src', TRENDING[0]!.url);
    });

    await test.step('tìm "cat": grid cập nhật theo q, section gần đây ẩn khi đang tìm', async () => {
      const picker = page.getByTestId('sticker-picker');
      const searchDone = page.waitForResponse((response) =>
        response.url().includes('/gifs/search'),
      );
      await picker.getByTestId('sticker-search').fill('cat');
      expect((await searchDone).ok()).toBeTruthy();
      const grid = picker.getByTestId('gif-grid');
      await expect(grid.getByTestId('gif-option')).toHaveCount(SEARCH_CAT.length);
      await expect(grid.locator('img').first()).toHaveAttribute('src', SEARCH_CAT[0]!.url);
      await expect(picker.getByTestId('gif-recent')).toHaveCount(0);
      await expect(picker.getByTestId('gif-attribution')).toBeVisible();
    });

    const cleanup = await alice.request.delete(`${API}/servers/${server.id}`, { headers });
    expect(cleanup.ok()).toBeTruthy();
  } finally {
    await alice.close();
  }
});

// TG.25c: thiếu nhà cung cấp (503 GIF_PROVIDER_UNAVAILABLE) → empty state riêng "chưa khả dụng",
// ẩn lưới và ẩn ghi công; chat vẫn gửi tin thường bình thường qua API thật.
test('GIF 503 provider unavailable: empty state riêng, gửi tin thường vẫn được', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const alice = await browser.newContext();
  try {
    const auth = await pacedLogin(alice.request, 'alice@ping.dev', 'password123');
    const headers = { Authorization: `Bearer ${auth.accessToken}` };
    const suffix = randomUUID().slice(0, 8);
    const server = (await (
      await alice.request.post(`${API}/servers`, { headers, data: { name: `GIF503 ${suffix}` } })
    ).json()) as ServerDetail;
    const channel = server.channels[0]!;

    const page = await alice.newPage();
    await page.route('**/api/v1/gifs/**', (route) =>
      route.fulfill({
        status: 503,
        contentType: 'application/json',
        body: JSON.stringify({
          code: 'GIF_PROVIDER_UNAVAILABLE',
          message: 'Tenor unavailable',
          requestId: 'gif-503-e2e',
        }),
      }),
    );
    await page.goto(`/servers/${server.id}/channels/${channel.id}`);
    await expect(page.getByTestId('message-composer')).toBeVisible({ timeout: 45_000 });

    await test.step('tab GIF: empty state "chưa khả dụng", không lưới, không ghi công', async () => {
      const picker = await openGifTab(page);
      await expect(picker.getByTestId('gif-unavailable')).toBeVisible({ timeout: 15_000 });
      await expect(picker.getByTestId('gif-grid')).toHaveCount(0);
      await expect(picker.getByTestId('gif-recent')).toHaveCount(0);
      await expect(picker.getByTestId('gif-attribution')).toHaveCount(0);
      await page.getByTestId('sticker-button').click(); // đóng picker
    });

    await test.step('chat vẫn gửi tin thường được (API thật)', async () => {
      const text = `tin thường sau lỗi GIF ${suffix}`;
      await page.getByTestId('message-composer').fill(text);
      await page.getByTestId('message-composer').press('Enter');
      await expect(
        paneOf(page, channel.name).locator('article').last().getByText(text),
      ).toBeVisible({ timeout: 15_000 });
    });

    const cleanup = await alice.request.delete(`${API}/servers/${server.id}`, { headers });
    expect(cleanup.ok()).toBeTruthy();
  } finally {
    await alice.close();
  }
});
