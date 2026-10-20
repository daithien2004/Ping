import { expect, type Locator, type Page, test } from '@playwright/test';

// F4 trên channel #long (300 tin, tạo ở global-setup). Nối tiếp trên MỘT trang: mỗi lần tải lại
// app tốn ~6 request, chạy rời từng test dễ chạm rate limit.
test.describe.configure({ mode: 'serial' });

let page: Page;
const serverId = () => process.env.E2E_SERVER_ID!;
const channelId = () => process.env.E2E_CHANNEL_ID!;

/** Vùng cuộn đang hiện. <Activity> giữ trang channel cũ ở dạng ẩn trong DOM. */
const pane = (name: string) => page.locator(`[aria-label="Tin nhắn trong #${name}"]:visible`);
const composer = (name: string) => page.getByRole('textbox', { name: `Nhắn #${name}` });
const distanceFromBottom = (scroller: Locator) =>
  scroller.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight);

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  await page.goto('/login');
  await page.getByLabel('Email').fill(process.env.E2E_EMAIL!);
  await page.getByLabel('Mật khẩu').fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page.getByRole('link', { name: '# general' })).toBeVisible();
  await page.goto(`/servers/${serverId()}/channels/${channelId()}`);
});

test.afterAll(() => page.close());

test('1. vào channel: xuống tin mới nhất, chỉ render phần đang thấy', async () => {
  await expect(page.getByText(/^#300 /)).toBeVisible();
  await expect.poll(() => distanceFromBottom(pane('long'))).toBeLessThan(2);
  expect(await pane('long').locator('article').count()).toBeLessThan(40);
});

test('2. cuộn lên: tải dần tin cũ tới đầu channel', async () => {
  const scroller = pane('long');
  // 300 tin / 50 mỗi trang: cứ kéo lên đầu tới khi tin #1 được render. Neo (anchorTo: 'end') giữ
  // nguyên tin đang xem sau mỗi trang nên phải kéo lại nhiều lần.
  await expect(async () => {
    await scroller.evaluate((el) => el.scrollTo(0, 0));
    await expect(page.getByText(/^#1 /)).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 30_000 });
  await expect(page.getByText('Đây là đầu kênh #long.')).toBeVisible();
});

test('3 + 5. gửi khi đang đọc tin cũ: hiện ngay (đang gửi), được xác nhận, tự xuống đáy', async () => {
  const content = `e2e gửi ${Date.now()}`;
  // Giữ request 500ms để thấy trạng thái optimistic.
  await page.route('**/channels/*/messages', async (route) => {
    if (route.request().method() === 'POST') await new Promise((r) => setTimeout(r, 500));
    await route.continue();
  });
  await composer('long').fill(content);
  await composer('long').press('Enter');

  const sent = page.locator('article', { hasText: content });
  await expect(sent).toHaveAttribute('aria-busy', 'true');
  await expect(composer('long')).toHaveValue('');
  await expect(sent).not.toHaveAttribute('aria-busy');
  await expect.poll(() => distanceFromBottom(pane('long'))).toBeLessThan(2);
  await page.unrouteAll();
});

test('4. server đã lưu nhưng client mất response → Thử lại cùng nonce, không trùng tin', async () => {
  const content = `e2e thử lại ${Date.now()}`;
  // Request TỚI server (tin được lưu) nhưng trình duyệt thấy lỗi mạng: đúng ca nonce phải chặn trùng.
  await page.route('**/channels/*/messages', async (route) => {
    if (route.request().method() !== 'POST') return route.continue();
    await route.fetch();
    await route.abort('connectionreset');
  });
  await composer('long').fill(content);
  await composer('long').press('Enter');
  await expect(page.getByText('Gửi thất bại')).toBeVisible();

  await page.unrouteAll();
  await page.getByRole('button', { name: 'Thử lại' }).click();
  const sent = page.locator('article', { hasText: content });
  await expect(sent).not.toHaveAttribute('aria-busy');
  await expect(page.getByText('Gửi thất bại')).toHaveCount(0);

  // Dữ liệu từ server (không phải cache): đúng MỘT tin.
  await page.reload();
  await expect(page.getByText(/^#300 /)).toBeAttached();
  await expect(page.locator('article:visible', { hasText: content })).toHaveCount(1);
});

test('6. chuyển channel rồi quay lại: còn nguyên nháp và vị trí cuộn', async () => {
  const scroller = pane('long');
  await expect.poll(() => distanceFromBottom(scroller)).toBeLessThan(2);
  await scroller.evaluate((el) => el.scrollBy(0, -2000));
  const before = await scroller.evaluate((el) => el.scrollTop);
  await composer('long').fill('nháp dở dang');

  await page.getByRole('link', { name: '# general' }).click();
  await expect(composer('general')).toBeVisible();
  await page.getByRole('link', { name: '# long' }).click();

  await expect(composer('long')).toHaveValue('nháp dở dang');
  expect(Math.abs((await pane('long').evaluate((el) => el.scrollTop)) - before)).toBeLessThan(2);
});
