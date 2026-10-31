import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import type { ChannelDto, ServerDetail } from '@ping/shared';
import { pacedLogin } from './login-pace';

const API = 'http://localhost:4000/api/v1';

/** Hộp xác nhận đang mở; antd giữ popup đã đóng trong DOM nên phải lọc theo phần tử đang hiện. */
const visiblePopconfirm = (page: Page) => page.locator('.ant-popconfirm').filter({ visible: true });

/**
 * TG.10: category + sắp xếp + topic trên UI thật — tạo category trong cài đặt server, kéo bằng
 * BÀN PHÍM (Alt+Arrow — phương án a11y của kéo thả), thu gọn category lưu qua reload, topic
 * hiển thị ở header, đổi tên/xoá category (kênh về vùng mặc định, không mất kênh).
 *
 * Dùng tài khoản seed (owner) vì đăng ký bị giới hạn 5 lượt/phút/IP; mỗi test một server riêng
 * qua API rồi thao tác UI. Server không xoá ở cuối — bộ e2e chung dùng DB dev được flush định kỳ.
 */
test('categories: create, keyboard move, collapse persistence, topic header, rename/delete', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const context = await browser.newContext();
  try {
    const auth = await pacedLogin(
      context.request,
      process.env.E2E_EMAIL!,
      process.env.E2E_PASSWORD!,
    );
    const headers = { Authorization: `Bearer ${auth.accessToken}` };
    const api = async <T>(
      method: 'get' | 'post' | 'put' | 'patch',
      url: string,
      data?: unknown,
    ) => {
      const response = await context.request[method](`${API}${url}`, { headers, data });
      expect(response.ok(), `${method.toUpperCase()} ${url} → ${response.status()}`).toBe(true);
      return (await response.json()) as T;
    };

    const server = await api<ServerDetail>('post', '/servers', {
      name: `Categories ${randomUUID().slice(0, 8)}`,
    });
    const channel = await api<ChannelDto>('post', `/servers/${server.id}/channels`, {
      name: `topic-${randomUUID().slice(0, 6)}`,
    });
    const detail = () => api<ServerDetail>('get', `/servers/${server.id}`);
    const channelOf = (body: ServerDetail) => body.channels.find((item) => item.id === channel.id)!;

    const page = await context.newPage();
    await page.goto(`/servers/${server.id}`);

    await test.step('sidebar mặc định: header "Kênh" và các kênh chưa xếp nhóm', async () => {
      await expect(
        page.locator('[data-testid="category-header"][data-category="__default"]'),
      ).toHaveText(/Kênh/);
      await expect(page.getByRole('link', { name: `# ${channel.name}` })).toBeVisible();
    });

    await test.step('tạo category trong cài đặt server', async () => {
      await page.goto(`/servers/${server.id}/settings`);
      const section = page.getByRole('region', { name: 'Danh mục' });
      await expect(section).toBeVisible();
      await section.getByRole('button', { name: 'Tạo danh mục' }).click();
      await page.getByRole('textbox', { name: 'Tên danh mục' }).fill('Nhóm A');
      await page
        .getByTestId('ping-modal')
        .getByRole('button', { name: 'Tạo', exact: true })
        .click();
      await expect(page.getByText('Đã tạo danh mục.')).toBeVisible();
      await expect(section.getByRole('row').filter({ hasText: 'Nhóm A' })).toBeVisible();
    });

    const categories = (await detail()).categories ?? [];
    const category = categories.find((item) => item.name === 'Nhóm A')!;

    await test.step('Alt+ArrowUp trên kênh đưa kênh vào CUỐI category phía trên', async () => {
      await page.goto(`/servers/${server.id}`);
      const link = page.getByRole('link', { name: `# ${channel.name}` });
      // Bấm lại trong poll: phím rơi vào lúc trang chưa hydrate thì không có listener;
      // sau khi kênh đã vào category, Alt+ArrowUp chỉ là no-op ở biên.
      await expect
        .poll(
          async () => {
            await link.press('Alt+ArrowUp');
            return channelOf(await detail()).categoryId;
          },
          { timeout: 20_000 },
        )
        .toBe(category.id);
      await expect(
        page.locator(`[data-testid="category-header"][data-category="${category.id}"]`),
      ).toBeVisible();
    });

    await test.step('thu gọn category lưu qua reload (localStorage theo user+server)', async () => {
      const header = page.locator(
        `[data-testid="category-header"][data-category="${category.id}"]`,
      );
      await expect(header).toHaveAttribute('aria-expanded', 'true');
      await header.click();
      await expect(header).toHaveAttribute('aria-expanded', 'false');
      await expect(page.getByRole('link', { name: `# ${channel.name}` })).toHaveCount(0);
      await page.reload();
      const reloaded = page.locator(
        `[data-testid="category-header"][data-category="${category.id}"]`,
      );
      await expect(reloaded).toHaveAttribute('aria-expanded', 'false');
      await reloaded.click();
      await expect(page.getByRole('link', { name: `# ${channel.name}` })).toBeVisible();
    });

    await test.step('topic: đặt trong header → hiển thị dưới tên kênh và API lưu', async () => {
      // Mở thẳng URL kênh (tải document mới): điều hướng client trong dev có lúc tồn tại hai
      // cây ChannelView (kênh cũ + kênh mới), click rơi vào node sắp bị gỡ nên modal mất state.
      await page.goto(`/servers/${server.id}/channels/${channel.id}`);
      const topic = 'Chủ đề bằng UI';
      const edit = page.getByTestId('channel-topic-edit');
      await expect(edit).toHaveCount(1);
      await edit.click();
      await page.getByTestId('channel-topic-input').fill(topic);
      await page.getByTestId('ping-modal').getByRole('button', { name: 'Lưu' }).click();
      await expect(page.getByTestId('channel-topic')).toHaveText(topic);
      await expect.poll(async () => channelOf(await detail()).topic).toBe(topic);
    });

    await test.step('đổi tên rồi xoá category → kênh về vùng mặc định, vẫn còn kênh', async () => {
      await page.goto(`/servers/${server.id}/settings`);
      const section = page.getByRole('region', { name: 'Danh mục' });
      const row = section.getByRole('row').filter({ hasText: 'Nhóm A' });
      await row.getByRole('button', { name: 'Đổi tên danh mục' }).click();
      await page.getByRole('textbox', { name: 'Tên danh mục' }).fill('Nhóm B');
      await page
        .getByTestId('ping-modal')
        .getByRole('button', { name: 'Lưu', exact: true })
        .click();
      await expect(section.getByRole('row').filter({ hasText: 'Nhóm B' })).toBeVisible();

      await section
        .getByRole('row')
        .filter({ hasText: 'Nhóm B' })
        .getByRole('button', { name: 'Xoá danh mục' })
        .click();
      await visiblePopconfirm(page).getByRole('button', { name: 'Xoá danh mục' }).click();
      await expect(page.getByText('Đã xoá danh mục.')).toBeVisible();

      await expect
        .poll(async () => channelOf(await detail()).categoryId, { timeout: 10_000 })
        .toBeNull();
      await expect.poll(async () => ((await detail()).categories ?? []).length).toBe(0);
      // Kênh KHÔNG bị xoá; về lại vùng mặc định.
      await page.goto(`/servers/${server.id}`);
      await expect(page.getByRole('link', { name: `# ${channel.name}` })).toBeVisible();
      expect(channelOf(await detail()).topic).toBe('Chủ đề bằng UI');
    });
  } finally {
    await context.close();
  }
});
