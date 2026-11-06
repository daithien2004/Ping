import { expect, type Page, test } from '@playwright/test';
import { paceLogin } from './login-pace';

// T6.10: quick switcher tải lười — chunk modal chỉ nạp sau lần bấm Ctrl/Cmd+K đầu tiên, dữ liệu
// thật (server của tôi, kênh server đang mở), lọc + điều hướng bằng bàn phím theo mẫu combobox.
const serverId = () => process.env.E2E_SERVER_ID!;
const channelUrl = () => `/servers/${serverId()}/channels/${process.env.E2E_CHANNEL_ID!}`;
const composer = (page: Page) => page.locator('[data-testid="message-composer"]:visible');

async function signIn(page: Page) {
  await paceLogin();
  await page.goto('/login');
  await page.getByLabel('Email').filter({ visible: true }).fill(process.env.E2E_EMAIL!);
  await page.getByLabel('Mật khẩu').filter({ visible: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(composer(page)).toBeVisible({ timeout: 45_000 });
}

test('Ctrl+K mở chuyển nhanh, lọc theo dữ liệu thật, Enter/Arrow điều hướng, Esc đóng', async ({
  page,
}) => {
  await signIn(page);
  await page.goto(channelUrl());
  await expect(composer(page)).toBeVisible();

  // Trước lần mở đầu tiên chưa có modal (chunk lazy chưa nạp, không render sẵn).
  await expect(page.getByTestId('quick-switcher-input')).toHaveCount(0);

  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: 'Chuyển nhanh' });
  await expect(dialog).toBeVisible();
  const input = page.getByTestId('quick-switcher-input');
  await expect(input).toBeFocused();
  await expect(input).toHaveAttribute('role', 'combobox');
  await expect(input).toHaveAttribute('aria-expanded', 'true');

  const options = page.getByTestId('quick-switcher-item');
  // Dữ liệu thật: server của người dùng + kênh của server đang mở (nhóm "Kênh").
  await expect(options.filter({ hasText: '# long' })).toBeVisible();
  // `hasText` của Playwright là substring KHÔNG phân biệt hoa thường: tên kênh do spec khác tạo
  // (vd. `empty-e1ae2e`) cũng khớp "E2E". Bám nhóm + tên server để không phụ thuộc dữ liệu may mắn.
  const e2eServer = page.getByRole('option', { name: /^Server \/E2E / });
  await expect(e2eServer).toBeVisible();

  // Điều hướng bằng phím: active chuyển từ option đầu sang option kế. KHÔNG Enter ở bước này:
  // spec khác trong cùng run có thể đã tạo thêm server cho user này, nên option kế không cố
  // định là kênh #long (Enter khi chưa lọc từng làm test đỏ trong full suite).
  const firstActive = await input.getAttribute('aria-activedescendant');
  expect(firstActive).toBeTruthy();
  await input.press('ArrowDown');
  await expect(input).not.toHaveAttribute('aria-activedescendant', firstActive!);

  // Mở lại: ô tìm kiếm luôn trống (modal tháo khi đóng), Esc đóng không điều hướng.
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
  await expect(composer(page)).toBeVisible();
  await page.keyboard.press('Control+k');
  await expect(dialog).toBeVisible();
  await expect(input).toHaveValue('');
  await input.fill('# long');
  await expect(options).toHaveCount(1);
  await expect(options.first()).toContainText('# long');
  await input.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`${channelUrl()}$`));

  // Tìm server rồi Enter → điều hướng về server (ChannelRedirect đưa tiếp vào kênh đầu tiên).
  await page.keyboard.press('Control+k');
  await expect(dialog).toBeVisible();
  await expect(input).toHaveValue('');
  await input.fill('E2E');
  await expect(e2eServer).toHaveCount(1);
  await input.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/servers/${serverId()}/(channels/|$)`));

  await page.keyboard.press('Control+k');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});
