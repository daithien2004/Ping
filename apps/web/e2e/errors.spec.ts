import { expect, type Page, test } from '@playwright/test';

// H4 (hướng dẫn 16.8): trang lỗi hiển thị mã lỗi để báo lại. API được ép lỗi bằng page.route.
const REQUEST_ID = '0b7c6e0e-5d4f-4c53-8a3e-6f5d8c1a9e42';

async function signIn(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Email').filter({ visible: true }).fill(process.env.E2E_EMAIL!);
  await page.getByLabel('Mật khẩu').filter({ visible: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page.getByRole('link', { name: '# general' })).toBeVisible();
}

const channelPath = () =>
  `/servers/${process.env.E2E_SERVER_ID}/channels/${process.env.E2E_CHANNEL_ID}`;

test('a 4xx in the content area shows the explanation and the error id, with the rail still usable', async ({
  page,
}) => {
  await signIn(page);
  await page.route('**/api/v1/servers/*/channels', (route) =>
    route.fulfill({
      status: 403,
      headers: { 'X-Request-Id': REQUEST_ID },
      json: { code: 'FORBIDDEN', message: 'x', requestId: REQUEST_ID },
    }),
  );
  await page.goto(channelPath());

  const alert = page.getByRole('alert').filter({ hasText: 'Không truy cập được' });
  await expect(alert).toBeVisible();
  await expect(alert).toContainText('Bạn không phải thành viên của server này.');
  await expect(alert).toContainText(`Mã lỗi: ${REQUEST_ID}`);
  await expect(page.getByRole('navigation', { name: 'Server' })).toBeVisible(); // cột server vẫn còn
  await expect(page.getByRole('button', { name: 'Thử lại' })).toBeVisible();
});

test('a 5xx quotes the error id inside the message itself (not twice)', async ({ page }) => {
  await signIn(page);
  await page.route('**/api/v1/servers/*/channels', (route) =>
    route.fulfill({
      status: 500,
      headers: { 'X-Request-Id': REQUEST_ID },
      json: { code: 'INTERNAL_ERROR', message: 'x', requestId: REQUEST_ID },
    }),
  );
  await page.goto(channelPath());

  const alert = page.getByRole('alert').filter({ hasText: 'Không truy cập được' });
  await expect(alert).toContainText(`Có lỗi xảy ra. Mã lỗi: ${REQUEST_ID}`);
  expect((await alert.innerText()).split(REQUEST_ID)).toHaveLength(2); // đúng một lần
});

test('an error in the root area (server list) falls to global-error with the id and a retry', async ({
  page,
}) => {
  await signIn(page);
  await page.route('**/api/v1/servers', (route) =>
    route.fulfill({
      status: 500,
      headers: { 'X-Request-Id': REQUEST_ID },
      json: { code: 'INTERNAL_ERROR', message: 'x', requestId: REQUEST_ID },
    }),
  );
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Đã xảy ra lỗi nghiêm trọng' })).toBeVisible();
  await expect(page.getByText(`Mã lỗi: ${REQUEST_ID}`)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Thử lại' })).toBeVisible();
});

test('an unknown URL shows the localized 404 with a way home', async ({ page }) => {
  await page.goto('/khong-co-trang-nay');
  await expect(page.getByRole('heading', { name: 'Không tìm thấy trang' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Về trang chủ' })).toBeVisible();
});
