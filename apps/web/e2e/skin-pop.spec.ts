import { expect, test, type Page } from '@playwright/test';
import { scan } from './axe';
import { seedDemo, signInAs } from './pop-demo';

// Skin Pop (ADR-0084): quét axe ở các màn chính với cookie `ping-skin=pop`, cả sáng lẫn tối, và
// kiểm lối chọn trong Cài đặt. Ảnh chụp ghi vào test-results/skin-pop để OWNER duyệt hình thức;
// đây KHÔNG phải baseline visual regression (chưa có, chờ OWNER duyệt).
const SCHEMES = ['light', 'dark'] as const;

async function shot(page: Page, name: string) {
  await page.screenshot({ path: `test-results/skin-pop/${name}.png` });
}

test('skin Pop: màn đăng nhập, khung chat và cài đặt giao diện qua axe, sáng và tối', async ({
  page,
  context,
  baseURL,
  request,
}) => {
  test.setTimeout(240_000);
  await context.addCookies([{ name: 'ping-skin', value: 'pop', url: baseURL! }]);

  for (const colorScheme of SCHEMES) {
    await page.emulateMedia({ colorScheme });
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Đăng nhập' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-skin', 'pop');
    await scan(page, `login pop ${colorScheme}`);
    await shot(page, `login-${colorScheme}`);
  }

  await page.emulateMedia({ colorScheme: 'light' });
  const demo = await seedDemo(request);
  await signInAs(page, demo);

  for (const colorScheme of SCHEMES) {
    await page.emulateMedia({ colorScheme });
    await page.goto(`/servers/${demo.serverId}/channels/${demo.channelId}`);
    await expect(page.getByRole('textbox', { name: 'Nhắn #thiet-ke' })).toBeVisible();
    await expect(page.getByTestId('message-reactions').first()).toBeVisible();
    await scan(page, `talk pop ${colorScheme}`);
    await shot(page, `talk-${colorScheme}`);

    // Popup qua portal: tooltip, menu, toast, hộp thoại (ảnh để duyệt hình thức; axe cho menu và hộp thoại).
    await page.getByTestId('personal-settings-rail').hover();
    await expect(page.getByRole('tooltip')).toBeVisible();
    await page.waitForTimeout(300); // đợi hiệu ứng mở của antd xong để ảnh thấy popup rõ
    await shot(page, `tooltip-${colorScheme}`);
    await page.mouse.move(700, 400);

    await page.getByRole('button', { name: 'Menu server' }).click();
    const copyItem = page.getByRole('menuitem', { name: 'Sao chép mã mời' });
    await expect(copyItem).toBeVisible();
    await scan(page, `server menu pop ${colorScheme}`, '[role="menu"]');
    await shot(page, `menu-${colorScheme}`);
    await copyItem.click();
    await expect(page.getByText(/Đã sao chép mã mời|Không sao chép được mã mời/)).toBeVisible();
    await page.waitForTimeout(300);
    await shot(page, `toast-${colorScheme}`);

    await page.getByRole('button', { name: 'Tạo server' }).click();
    await expect(page.getByRole('dialog', { name: 'Bắt đầu với Ping' })).toBeVisible();
    await scan(page, `create-server dialog pop ${colorScheme}`);
    await shot(page, `dialog-${colorScheme}`);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);

    // Chuông thông báo của kênh: popover có mức (segmented), nút tắt tiếng và công tắc.
    await page.getByTestId('notify-bell').click();
    await expect(page.getByTestId('notify-popover')).toBeVisible();
    await scan(page, `notify popover pop ${colorScheme}`, '[data-testid="notify-popover"]');
    await page.waitForTimeout(300);
    await shot(page, `notify-${colorScheme}`);
    await page.keyboard.press('Escape');

    await page.goto('/settings/appearance');
    await expect(page.getByTestId('settings-appearance')).toBeVisible();
    await scan(page, `settings appearance pop ${colorScheme}`);
  }

  // Lối chọn: đổi sang mặc định rồi về Pop, cookie và data-skin theo kịp.
  await page.getByTestId('settings-skin-default').click();
  await expect(page.locator('html')).toHaveAttribute('data-skin', 'default');
  await page.getByTestId('settings-skin-pop').click();
  await expect(page.locator('html')).toHaveAttribute('data-skin', 'pop');
  const cookies = await context.cookies();
  expect(cookies.find((cookie) => cookie.name === 'ping-skin')?.value).toBe('pop');
});
