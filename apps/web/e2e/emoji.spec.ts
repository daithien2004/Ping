import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { type ServerDetail } from '@ping/shared';
import { pacedLogin } from './login-pace';

const API = 'http://localhost:4000/api/v1';

/**
 * TG.23: emoji picker — mở/nhóm/tìm "cười"/chọn gần đây/tông da; gợi ý :ten: qua bàn phím;
 * emoji lớn khi tin chỉ toàn emoji. Dùng pacedLogin (10 login/phút/IP).
 */
test('emoji picker: search, insert, recent, suggestion and big emoji', async ({ browser }) => {
  test.setTimeout(240_000);
  const ownerContext = await browser.newContext();
  try {
    const auth = await pacedLogin(ownerContext.request, 'alice@ping.dev', 'password123');
    const headers = { Authorization: `Bearer ${auth.accessToken}` };

    const suffix = randomUUID().slice(0, 8);
    const server = (await (
      await ownerContext.request.post(`${API}/servers`, {
        headers,
        data: { name: `Emoji ${suffix}` },
      })
    ).json()) as ServerDetail;
    const channelId = server.channels[0]!.id;

    const page = await ownerContext.newPage();
    await page.goto(`/servers/${server.id}/channels/${channelId}`);
    const composer = page.getByTestId('message-composer');
    await expect(composer).toBeVisible({ timeout: 45_000 });

    await test.step('mở picker, tìm "cười" (không dấu) và chọn', async () => {
      await page.getByTestId('emoji-button').click();
      const picker = page.getByTestId('emoji-picker');
      await expect(picker).toBeVisible({ timeout: 15_000 });
      await page.getByTestId('emoji-search').fill('cuoi');
      // "cười" trúng smile/joy/laughing — grid có kết quả, không phải trạng thái rỗng.
      await expect(picker.getByRole('gridcell').first()).toBeVisible();
      const first = picker.getByRole('gridcell').first();
      const label = await first.getAttribute('aria-label');
      expect(label).toBeTruthy();
      await first.click();
      // Chọn xong: picker đóng, composer chứa emoji.
      await expect(picker).toHaveCount(0);
      await expect(composer).not.toHaveValue('');
    });

    await test.step('gợi ý :ten: qua bàn phím: gõ ":fir" → mũi tên + Enter chèn shortcode', async () => {
      await composer.fill('đang nóng :fir');
      await expect(page.getByTestId('emoji-suggestions')).toBeVisible({ timeout: 15_000 });
      // Mục đầu đã được chọn sẵn (suggestionIndex=0): Enter chọn ngay.
      await composer.press('Enter');
      await expect(composer).toHaveValue(/đang nóng :[a-z_]+:/);
    });

    await test.step('gửi — shortcode render qua map markdown (gợi ý đầu là gold_medal)', async () => {
      await composer.press('Enter');
      await expect(page.getByText('🥇').first()).toBeVisible({ timeout: 15_000 });
    });

    await test.step('tin chỉ toàn emoji → render cỡ lớn (big-emoji)', async () => {
      await composer.fill('😄 😄 😄');
      await composer.press('Enter');
      await expect(page.getByTestId('big-emoji').first()).toBeVisible({ timeout: 15_000 });
      // Tin có chữ thường → không còn big-emoji mới.
      await composer.fill('xin chào 😄');
      await composer.press('Enter');
      await expect(page.getByTestId('big-emoji')).toHaveCount(1);
    });

    await test.step('Gần đây: emoji vừa chọn nằm trong nhóm Gần đây', async () => {
      await page.getByTestId('emoji-button').click();
      const picker = page.getByTestId('emoji-picker');
      await picker.getByRole('tab', { name: 'Gần đây' }).click();
      await expect(picker.getByRole('gridcell').first()).toBeVisible();
      await page.keyboard.press('Escape');
    });

    const cleanup = await ownerContext.request.delete(`${API}/servers/${server.id}`, {
      headers,
    });
    expect(cleanup.ok()).toBeTruthy();
  } finally {
    await ownerContext.close();
  }
});
