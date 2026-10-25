import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { type AuthResponse, type ServerDetail } from '@ping/shared';

const API = 'http://localhost:4000/api/v1';

/**
 * T4.6: UI tìm kiếm — mở dialog từ header kênh, tìm (FTS không dấu), lọc kênh, bấm kết quả
 * nhảy tới tin (kiểu ?m= highlight). Dùng tài khoản seed.
 */
test('search ui: find messages, filter by channel, jump to message', async ({ browser }) => {
  test.setTimeout(240_000);
  const ownerContext = await browser.newContext();
  try {
    const login = await ownerContext.request.post(`${API}/auth/login`, {
      data: { email: 'alice@ping.dev', password: 'password123' },
    });
    expect(login.ok()).toBeTruthy();
    const auth = (await login.json()) as AuthResponse;
    const headers = { Authorization: `Bearer ${auth.accessToken}` };

    const suffix = randomUUID().slice(0, 8);
    const server = (await (
      await ownerContext.request.post(`${API}/servers`, {
        headers,
        data: { name: `SearchUI ${suffix}` },
      })
    ).json()) as ServerDetail;
    const generalId = server.channels[0]!.id;
    const second = (
      await (
        await ownerContext.request.post(`${API}/servers/${server.id}/channels`, {
          headers,
          data: { name: 'kho-tai-lieu' },
        })
      ).json()
    ).id;

    const send = (channelId: string, content: string) =>
      ownerContext.request.post(`${API}/channels/${channelId}/messages`, {
        headers,
        data: { content, nonce: randomUUID() },
      });
    expect((await send(generalId, `họp nhóm lúc 9h về kế hoạch ${suffix}`)).ok()).toBeTruthy();
    expect(
      (await send(second, `biên bản họp ${suffix} đã được lưu vào kho tài liệu`)).ok(),
    ).toBeTruthy();

    const page = await ownerContext.newPage();
    await page.goto(`/servers/${server.id}/channels/${generalId}`);
    await expect(page.getByText(`họp nhóm lúc 9h về kế hoạch ${suffix}`)).toBeVisible({
      timeout: 15_000,
    });

    await page.getByRole('button', { name: 'Tìm trong server' }).click();
    const input = page.getByTestId('search-input');
    await expect(input).toBeVisible();

    await test.step('tìm không dấu (unaccent) ra cả hai kênh', async () => {
      await input.fill(`bien ban hop ${suffix}`);
      await expect(page.getByTestId('search-results').locator('li')).toHaveCount(1, {
        timeout: 10_000,
      });
      await expect(page.getByTestId('search-results')).toContainText('kho-tai-lieu');
    });

    await test.step('lọc theo kênh làm rỗng/thu hẹp đúng', async () => {
      await page.getByLabel('Lọc theo kênh').click();
      await page.locator('.ant-select-item-option', { hasText: '# general' }).click();
      await expect(page.getByText('Không tìm thấy tin nào.')).toBeVisible({ timeout: 10_000 });
      await page.getByLabel('Lọc theo kênh').click();
      await page.locator('.ant-select-item-option', { hasText: 'kho-tai-lieu' }).click();
      await expect(page.getByTestId('search-results').locator('li')).toHaveCount(1, {
        timeout: 10_000,
      });
    });

    await test.step('bấm kết quả → nhảy tới tin ở kênh đúng, có highlight', async () => {
      await page
        .getByTestId('search-results')
        .getByRole('button', { name: new RegExp(`biên bản họp ${suffix}`) })
        .click();
      await expect(page).toHaveURL(new RegExp(`/servers/${server.id}/channels/${second}\\?m=`), {
        timeout: 15_000,
      });
      // Tin đích hiện trong kênh đích.
      await expect(
        page.getByText(`biên bản họp ${suffix} đã được lưu vào kho tài liệu`),
      ).toBeVisible({ timeout: 15_000 });
    });

    const cleanup = await ownerContext.request.delete(`${API}/servers/${server.id}`, {
      headers,
    });
    expect(cleanup.ok()).toBeTruthy();
  } finally {
    await ownerContext.close();
  }
});
