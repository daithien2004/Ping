import { expect, type Page, test } from '@playwright/test';
import { paceLogin } from './login-pace';

const serverId = () => process.env.E2E_SERVER_ID!;
const channelUrl = () => `/channels/${serverId()}/${process.env.E2E_CHANNEL_ID!}`;
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

  await expect(page.getByTestId('quick-switcher-input')).toHaveCount(0);

  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: 'Chuyển nhanh' });
  await expect(dialog).toBeVisible();
  const input = page.getByTestId('quick-switcher-input');
  await expect(input).toBeFocused();
  await expect(input).toHaveAttribute('role', 'combobox');
  await expect(input).toHaveAttribute('aria-expanded', 'true');

  const options = page.getByTestId('quick-switcher-item');
  await expect(options.filter({ hasText: '# long' })).toBeVisible();
  const e2eServer = page.getByRole('option', { name: /^Server \/E2E / });
  await expect(e2eServer).toBeVisible();

  const firstActive = await input.getAttribute('aria-activedescendant');
  expect(firstActive).toBeTruthy();
  await input.press('ArrowDown');
  await expect(input).not.toHaveAttribute('aria-activedescendant', firstActive!);

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

  await page.keyboard.press('Control+k');
  await expect(dialog).toBeVisible();
  await expect(input).toHaveValue('');
  await input.fill('E2E');
  await expect(e2eServer).toHaveCount(1);
  await input.press('Enter');
  await expect(dialog).toHaveCount(0);
  await expect(page).toHaveURL(new RegExp(`/channels/${serverId()}/[0-9a-f-]+$`));

  await page.keyboard.press('Control+k');
  await expect(dialog).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);
});
