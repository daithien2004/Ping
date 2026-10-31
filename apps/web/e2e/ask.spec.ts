import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, test, type Page } from '@playwright/test';
import { type ServerDetail } from '@ping/shared';
import { pacedLogin } from './login-pace';

const API = 'http://localhost:4000/api/v1';
const CITATION_ID = '0190a8f2-3c4d-7e8f-9a0b-1c2d3e4f5a6b';
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

/**
 * Quét axe trên đúng ngăn kéo (antd đặt aria-hidden lên phần trang phía sau, không quét cả trang).
 * Đợi hết chuyển động mở drawer/alert trước khi quét để màu đã ổn định.
 */
async function scanDrawer(page: Page, what: string) {
  await page.waitForFunction(
    () =>
      document
        .getAnimations()
        .every((animation) => animation.effect?.getComputedTiming().iterations === Infinity),
    undefined,
    { timeout: 5000 },
  );
  const { violations } = await new AxeBuilder({ page })
    .withTags(TAGS)
    .include('[role="dialog"]')
    .analyze();
  expect(
    violations.map(
      (v) =>
        `${v.id} (${v.impact}): ${v.help} → ${v.nodes
          .slice(0, 3)
          .map((n) => n.target.join(' '))
          .join(' | ')}`,
    ),
    what,
  ).toEqual([]);
}

function sse(events: Array<{ type: string; data: unknown }>): string {
  return events
    .map((event) => `event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`)
    .join('');
}

/**
 * TF.11: ngăn kéo "Hỏi Ping" — văn bản stream, chip trích dẫn, skeleton chờ, aria-live và lỗi
 * theo mã. Chặn đúng route ask để không gọi LLM thật: nội dung SSE do test quyết định, phần
 * còn lại (auth, quyền, kênh) vẫn chạy trên API thật.
 */
async function interceptAsk(
  page: Page,
  handler: (method: string) => Promise<{ status: number; body?: string }>,
) {
  await page.route('**/api/v1/servers/*/ask', async (route) => {
    const request = route.request();
    const origin = new URL(page.url()).origin;
    const headers = {
      'access-control-allow-origin': origin,
      'access-control-allow-credentials': 'true',
      'access-control-allow-headers': 'authorization,content-type,accept,x-ping-client',
      'access-control-allow-methods': 'POST,OPTIONS',
    };
    if (request.method() === 'OPTIONS') {
      await route.fulfill({ status: 204, headers });
      return;
    }
    const result = await handler(request.method());
    try {
      await route.fulfill({
        status: result.status,
        headers:
          result.body === undefined
            ? headers
            : { ...headers, 'content-type': 'text/event-stream; charset=utf-8' },
        body: result.body,
      });
    } catch {
      // Client đã hủy request (nút Hủy) — không còn gì để trả.
    }
  });
}

test('ask ui: stream answer, citation chip, skeleton and aria-live', async ({ browser }) => {
  test.setTimeout(120_000);
  const context = await browser.newContext();
  try {
    const auth = await pacedLogin(context.request, 'alice@ping.dev', 'password123');
    const headers = { Authorization: `Bearer ${auth.accessToken}` };
    const suffix = randomUUID().slice(0, 8);
    const server = (await (
      await context.request.post(`${API}/servers`, {
        headers,
        data: { name: `AskUI ${suffix}` },
      })
    ).json()) as ServerDetail;
    const channelId = server.channels[0]!.id;

    const page = await context.newPage();
    const answer = 'Theo lịch sử kênh, buổi họp diễn ra lúc 9 giờ.';
    await interceptAsk(page, async () => {
      await new Promise((resolve) => setTimeout(resolve, 1_200));
      return {
        status: 200,
        body: sse([
          { type: 'meta', data: { retrievedChunks: 1, messageCount: 2 } },
          { type: 'delta', data: { text: 'Theo lịch sử kênh, ' } },
          { type: 'delta', data: { text: 'buổi họp diễn ra lúc 9 giờ.' } },
          { type: 'done', data: { citations: [CITATION_ID], model: 'mock' } },
        ]),
      };
    });

    await page.goto(`/servers/${server.id}/channels/${channelId}`);
    await page.getByTestId('ask-ai-button').click();
    await expect(page.getByTestId('ask-input')).toBeVisible();

    await page.getByTestId('ask-input').fill('Họp lúc mấy giờ?');
    await page.getByTestId('ask-send').click();

    // Trong lúc stream: trạng thái + skeleton giữ chỗ (ẩn với trình đọc màn hình).
    await expect(page.getByText('Đang hỏi…')).toBeVisible();
    await expect(page.getByTestId('ask-skeleton')).toBeVisible();
    await expect(page.getByTestId('ask-cancel')).toBeVisible();

    // Xong: câu trả lời nằm trong vùng aria-live, chip trích dẫn hiện đúng ID.
    const live = page.getByTestId('ask-live');
    await expect(live).toContainText(answer, { timeout: 15_000 });
    await expect(page.getByTestId('ask-answer')).toContainText('Câu trả lời');
    await expect(page.getByTestId(`ask-citation-${CITATION_ID}`)).toBeVisible();
    await expect(page.getByTestId('ask-skeleton')).toBeHidden();

    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme });
      await scanDrawer(page, `ask drawer answer ${colorScheme}`);
    }
    await page.emulateMedia({ colorScheme: 'light' });

    await page.getByTestId('ask-close').click();
    await expect(page.getByTestId('ask-input')).toBeHidden();

    expect((await context.request.delete(`${API}/servers/${server.id}`, { headers })).ok()).toBe(
      true,
    );
  } finally {
    await context.close();
  }
});

test('ask ui: per-error code message and cancel stops the skeleton', async ({ browser }) => {
  test.setTimeout(120_000);
  const context = await browser.newContext();
  try {
    const auth = await pacedLogin(context.request, 'alice@ping.dev', 'password123');
    const headers = { Authorization: `Bearer ${auth.accessToken}` };
    const suffix = randomUUID().slice(0, 8);
    const server = (await (
      await context.request.post(`${API}/servers`, {
        headers,
        data: { name: `AskErr ${suffix}` },
      })
    ).json()) as ServerDetail;
    const channelId = server.channels[0]!.id;

    const page = await context.newPage();
    let mode: 'error' | 'slow' = 'error';
    await interceptAsk(page, async () => {
      if (mode === 'error') {
        return {
          status: 200,
          body: sse([{ type: 'error', data: { code: 'AI_QUOTA_EXCEEDED', message: 'quota' } }]),
        };
      }
      await new Promise((resolve) => setTimeout(resolve, 800));
      return {
        status: 200,
        body: sse([{ type: 'done', data: { citations: [CITATION_ID], model: 'mock' } }]),
      };
    });

    await page.goto(`/servers/${server.id}/channels/${channelId}`);
    await page.getByTestId('ask-ai-button').click();
    await page.getByTestId('ask-input').fill('Còn lượt hỏi không?');
    await page.getByTestId('ask-send').click();

    // Mã lỗi AI_QUOTA_EXCEEDED có câu riêng, nằm trong role=alert.
    await expect(page.getByTestId('ask-error')).toContainText(
      'Bạn đã dùng hết số lượt hỏi AI hôm nay',
    );
    await expect(page.getByTestId('ask-answer')).toBeHidden();

    for (const colorScheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme });
      await scanDrawer(page, `ask drawer error ${colorScheme}`);
    }
    await page.emulateMedia({ colorScheme: 'light' });

    // Hủy giữa chừng: skeleton biến mất, không hiện câu trả lời/ lỗi.
    mode = 'slow';
    await page.getByTestId('ask-close').click();
    await expect(page.getByTestId('ask-input')).toBeHidden();
    await page.getByTestId('ask-ai-button').click();
    await page.getByTestId('ask-input').fill('Câu hỏi bị hủy');
    await page.getByTestId('ask-send').click();
    await expect(page.getByTestId('ask-skeleton')).toBeVisible();
    await page.getByTestId('ask-cancel').click();
    await expect(page.getByTestId('ask-skeleton')).toBeHidden();
    await expect(page.getByTestId('ask-error')).toBeHidden();
    await expect(page.getByTestId('ask-answer')).toBeHidden();

    await page.getByTestId('ask-close').click();
    expect((await context.request.delete(`${API}/servers/${server.id}`, { headers })).ok()).toBe(
      true,
    );
  } finally {
    await context.close();
  }
});
