import { expect, type Page, test } from '@playwright/test';

// T6.8: ba mốc bề ngang của ADR-0038 (375 / 768 / 1280). Đổi viewport trên cùng một trang để
// không tốn thêm lượt /auth/login (10/phút/IP) và kiểm luôn phản ứng khi đổi kích thước.
test.describe.configure({ mode: 'serial' });

let page: Page;
const serverId = () => process.env.E2E_SERVER_ID!;
const channelId = () => process.env.E2E_CHANNEL_ID!;
const channelUrl = () => `/servers/${serverId()}/channels/${channelId()}`;
// <Activity> giữ trang kênh cũ ẩn trong DOM nên mọi locator phải lọc `:visible`.
const composer = () => page.locator('[data-testid="message-composer"]:visible');
const scroller = () => page.locator('[data-testid="message-scroll"]:visible');

/** Trang app không được tràn ngang: không có phần tử nào rộng hơn khung nhìn. */
async function expectNoHorizontalOverflow() {
  const { scroll, client } = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(scroll, `tràn ngang: scrollWidth ${scroll} > clientWidth ${client}`).toBeLessThanOrEqual(
    client + 1,
  );
}

async function setViewport(width: number, height: number) {
  await page.setViewportSize({ width, height });
  // Chờ transition của drawer (200ms) kết thúc trước khi đo bố cục.
  await page.waitForTimeout(300);
}

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await page.goto('/login');
  await page.getByLabel('Email').fill(process.env.E2E_EMAIL!);
  await page.getByLabel('Mật khẩu').fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(composer()).toBeVisible();
  await page.goto(channelUrl());
  await expect(composer()).toBeVisible();
});

test.afterAll(() => page.close());

test('1280: rail + sidebar cạnh nhau, không tràn ngang, gửi tin', async () => {
  await setViewport(1280, 900);
  await expect(page.getByTestId('mobile-nav-toggle')).toBeHidden();
  // Rail + sidebar hiện tĩnh; drawer chỉ dành cho < md.
  await expect(page.getByTestId('dm-rail')).toBeVisible();
  await expect(page.getByRole('link', { name: '# general' })).toBeVisible();
  await expectNoHorizontalOverflow();

  const content = `responsive 1280 ${Date.now()}`;
  await composer().fill(content);
  await composer().press('Enter');
  await expect(page.getByText(content)).toBeVisible();
});

test('768: mốc md vẫn là rail + sidebar, chưa có thanh trên', async () => {
  await setViewport(768, 900);
  await expect(page.getByTestId('mobile-nav-toggle')).toBeHidden();
  await expect(page.getByTestId('dm-rail')).toBeVisible();
  await expect(page.getByRole('link', { name: '# general' })).toBeVisible();
  await expectNoHorizontalOverflow();

  const content = `responsive 768 ${Date.now()}`;
  await composer().fill(content);
  await composer().press('Enter');
  await expect(page.getByText(content)).toBeVisible();
});

test('375: thanh trên + drawer chung, Esc đóng và trả focus', async () => {
  await setViewport(375, 812);
  const toggle = page.getByTestId('mobile-nav-toggle');
  await expect(toggle).toBeVisible();
  // Sidebar nằm trong drawer nên phải ẩn khi drawer đóng.
  await expect(page.getByRole('link', { name: '# general' })).toBeHidden();
  await expect(composer()).toBeVisible();
  await expectNoHorizontalOverflow();

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  // Drawer chứa cả rail (DM) lẫn sidebar kênh.
  await expect(page.getByTestId('dm-rail')).toBeVisible();
  await expect(page.getByRole('link', { name: '# general' })).toBeVisible();
  await expectNoHorizontalOverflow();

  await page.keyboard.press('Escape');
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('link', { name: '# general' })).toBeHidden();
  await expect(toggle).toBeFocused();

  const content = `responsive 375 ${Date.now()}`;
  await composer().fill(content);
  await composer().press('Enter');
  await expect(page.getByText(content)).toBeVisible();
});

test('375: chọn kênh trong drawer thì drawer tự đóng, danh sách ảo vẫn cuộn được', async () => {
  // Đang ở #long (300 tin seed): chỉ render phần đang thấy.
  await expect(page.getByText(/^#300 /)).toBeVisible();
  expect(await scroller().locator('article').count()).toBeLessThan(40);

  await page.getByTestId('mobile-nav-toggle').click();
  await page.getByRole('link', { name: '# general' }).click();
  // Đổi route đóng drawer (AppShell theo dõi pathname).
  await expect(page.getByRole('link', { name: '# general' })).toBeHidden();
  await expect(composer()).toBeVisible();

  // Quay lại #long: <Activity> giữ trang cũ nên phải hiện lại đúng tin mới nhất. Về đáy tường
  // minh trước khi khẳng định — vị trí cuộn của trang được giữ lại không phải hợp đồng của
  // trình duyệt khi Activity ẩn/hiện.
  await page.goBack();
  await expect(composer()).toBeVisible();
  await scroller().evaluate((element) => element.scrollTo(0, element.scrollHeight));
  await expect(page.getByText(/^#300 /)).toBeVisible();

  // Danh sách ảo vẫn cuộn được sau chuyến đi qua drawer: lên đầu rồi về đáy, vẫn chỉ render
  // phần đang thấy. Không đòi tải hết 6 trang tin cũ: mỗi trang là một request, một lần lỗi
  // mạng giữa chừng là cả vòng chờ đứng im (đã hỏng CI ở bản trước) — việc tải tin cũ có spec
  // riêng (messages.spec: "cuộn lên: tải dần tin cũ tới đầu channel").
  await scroller().evaluate((element) => element.scrollTo(0, 0));
  await expect(page.getByText(/^#300 /)).toBeHidden();
  expect(await scroller().locator('article').count()).toBeGreaterThan(0);
  await scroller().evaluate((element) => element.scrollTo(0, element.scrollHeight));
  await expect(page.getByText(/^#300 /)).toBeVisible();
  await expectNoHorizontalOverflow();
});
