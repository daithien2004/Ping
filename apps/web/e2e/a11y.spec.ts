import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { paceLogin } from './login-pace';

// H4 (hướng dẫn 16.8, ADR-0029): quét accessibility tự động bằng axe (WCAG 2.0/2.1 A và AA) trên các
// màn hình chính, ở cả nền sáng lẫn nền tối. Violation nào cũng làm test đỏ: sửa app (hoặc token màu
// trong globals.css), đừng nới bộ luật. Đăng nhập bị giới hạn 5 lần/phút/IP nên mỗi file chỉ đăng nhập
// một lần và đổi nền sáng/tối bằng emulateMedia.
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

// `only`: vùng cần quét. Menu modal của Radix đặt aria-hidden lên phần còn lại của trang nhưng phần
// đó vẫn focusable trên DOM (focus bị bẫy bên trong menu) → axe báo aria-hidden-focus; chỉ quét menu.
// axe đọc màu tính toán tại thời điểm quét: ngay sau khi đổi nền sáng/tối hoặc mở menu/hộp thoại, các chuyển động CSS
// (transition màu, animate-in) còn chạy dở nên màu ở giữa chừng làm contrast "đỏ" lúc có lúc không (đã gặp trên CI).
// Đợi hết chuyển động hữu hạn rồi mới quét.
async function settleAnimations(page: Page) {
  await page.waitForFunction(
    () =>
      document
        .getAnimations()
        .every((animation) => animation.effect?.getComputedTiming().iterations === Infinity),
    undefined,
    { timeout: 5000 },
  );
}

async function scan(page: Page, what: string, only?: string) {
  await settleAnimations(page);
  const builder = new AxeBuilder({ page }).withTags(TAGS);
  const { violations } = await (only ? builder.include(only) : builder).analyze();
  const summary = violations.map(
    (v) =>
      `${v.id} (${v.impact}): ${v.help} → ${v.nodes
        .slice(0, 3)
        .map((n) => n.target.join(' '))
        .join(' | ')}`,
  );
  expect(summary, what).toEqual([]);
}

async function signIn(page: Page) {
  await paceLogin();
  await page.goto('/login');
  await page.getByLabel('Email').filter({ visible: true }).fill(process.env.E2E_EMAIL!);
  await page.getByLabel('Mật khẩu').filter({ visible: true }).fill(process.env.E2E_PASSWORD!);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page.getByRole('link', { name: '# general' })).toBeVisible();
}

const SCHEMES = ['light', 'dark'] as const;

test('login and register pages, light and dark', async ({ page }) => {
  for (const colorScheme of SCHEMES) {
    await page.emulateMedia({ colorScheme });
    await page.goto('/login');
    await expect(page.getByRole('heading', { name: 'Đăng nhập' })).toBeVisible();
    await scan(page, `login ${colorScheme}`);
    await page.goto('/register');
    await expect(page.getByRole('heading', { name: 'Tạo tài khoản' })).toBeVisible();
    await scan(page, `register ${colorScheme}`);
  }
});

test('error states, light and dark', async ({ page }) => {
  for (const colorScheme of SCHEMES) {
    await page.emulateMedia({ colorScheme });
    await page.goto('/khong-co-trang-nay');
    await expect(page.getByRole('heading', { name: 'Không tìm thấy trang' })).toBeVisible();
    await scan(page, `not found ${colorScheme}`);
  }
});

test('app shell with a channel, the message menu and the create-server dialog, light and dark', async ({
  page,
}) => {
  await signIn(page);
  await page.goto(`/servers/${process.env.E2E_SERVER_ID}/channels/${process.env.E2E_CHANNEL_ID}`);
  await expect(page.getByRole('textbox', { name: 'Nhắn #long' })).toBeVisible();

  for (const colorScheme of SCHEMES) {
    await page.emulateMedia({ colorScheme });
    await scan(page, `app shell ${colorScheme}`);

    await page.getByRole('button', { name: 'Thao tác tin nhắn' }).last().click();
    await expect(page.getByRole('menuitem', { name: 'Sửa' })).toBeVisible();
    await scan(page, `message actions menu ${colorScheme}`, '[role="menu"]');
    await page.keyboard.press('Escape');

    await page.getByRole('button', { name: 'Tạo server' }).click();
    await expect(page.getByRole('dialog', { name: 'Bắt đầu với Ping' })).toBeVisible();
    await scan(page, `create-server dialog ${colorScheme}`);
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
});
