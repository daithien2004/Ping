import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { pacedLogin } from './login-pace';
import type { AuthResponse, ServerDetail } from '@ping/shared';

// H10 (ADR-0030): panel thành viên, presence realtime giữa hai phiên, ẩn/hiện bằng nút.
const API = 'http://localhost:4000/api/v1';

test('member panel shows who is online, follows presence live, and can be hidden', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  const a = await browser.newContext();
  const b = await browser.newContext();
  try {
    const owner = await pacedLogin(a.request, process.env.E2E_EMAIL!, process.env.E2E_PASSWORD!);
    const suffix = randomUUID().slice(0, 6);
    const displayName = `Zed ${suffix}`;
    const joiner = (await (
      await b.request.post(`${API}/auth/register`, {
        data: {
          email: `mem-${suffix}@example.test`,
          username: `mem_${suffix}`,
          displayName,
          password: 'e2e-password',
        },
      })
    ).json()) as AuthResponse;
    const serverId = process.env.E2E_SERVER_ID!;
    const server = (await (
      await a.request.get(`${API}/servers/${serverId}`, {
        headers: { Authorization: `Bearer ${owner.accessToken}` },
      })
    ).json()) as ServerDetail;
    expect(
      (
        await b.request.post(`${API}/servers/join`, {
          headers: { Authorization: `Bearer ${joiner.accessToken}` },
          data: { inviteCode: server.inviteCode },
        })
      ).ok(),
    ).toBeTruthy();

    const path = `/servers/${serverId}/channels/${process.env.E2E_CHANNEL_ID}`;
    const pa = await a.newPage();
    await pa.goto(path);
    const panel = pa.getByRole('complementary', { name: 'Thành viên' });
    const row = panel.getByRole('listitem').filter({ hasText: displayName });

    // B chưa mở trang nào: có trong danh sách nhưng offline.
    await expect(row).toBeVisible();
    await expect(row).toContainText('Offline');
    await expect(panel.getByRole('region', { name: /^Offline/ })).toContainText(displayName);

    // B mở trang → A thấy B chuyển sang nhóm Online, không tải lại.
    const pb = await b.newPage();
    await pb.goto(path);
    await expect(panel.getByRole('region', { name: /^Đang online/ })).toContainText(displayName);
    await expect(row).toContainText('Đang online');

    // B đóng trang → về Offline.
    await pb.close();
    await expect(panel.getByRole('region', { name: /^Offline/ })).toContainText(displayName);

    // Nút ẩn/hiện, bằng bàn phím: huy hiệu Next dev che góc phải trên nên chuột không bấm tới được.
    const hide = pa.getByRole('button', { name: 'Ẩn danh sách thành viên' });
    await hide.focus();
    await pa.keyboard.press('Enter');
    await expect(panel).toHaveCount(0);
    await pa.getByRole('button', { name: 'Hiện danh sách thành viên' }).focus();
    await pa.keyboard.press('Enter');
    await expect(panel).toBeVisible();
  } finally {
    await a.close();
    await b.close();
  }
});
