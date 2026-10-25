import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { type ServerDetail } from '@ping/shared';
import { pacedLogin } from './login-pace';

const API = 'http://localhost:4000/api/v1';
const SEED_PASSWORD = 'password123';

/** Hộp xác nhận đang mở; antd giữ popup đã đóng trong DOM nên phải lọc theo phần tử đang hiện. */
const visiblePopconfirm = (page: Page) => page.locator('.ant-popconfirm').filter({ visible: true });

/**
 * T3.6: mã mời trên bề mặt quản trị — xem/sao chép, tạo mã mới (vô hiệu mã cũ),
 * và luồng tham gia báo lỗi rõ ràng cho mã thu hồi/hết hạn.
 *
 * Dùng tài khoản seed (owner qua env + carol) vì `POST /auth/register` giới hạn
 * 5 lượt/phút/IP. Server riêng cho test này, xoá ở cuối.
 */
test('admin invite: display, regenerate revokes old code, join reports clear errors', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const ownerContext = await browser.newContext();
  const joinerContext = await browser.newContext();
  try {
    const login = async (context: typeof ownerContext, email: string, password: string) => {
      const auth = await pacedLogin(context.request, email, password);
      return { auth, headers: { Authorization: `Bearer ${auth.accessToken}` } };
    };

    const owner = await login(ownerContext, process.env.E2E_EMAIL!, process.env.E2E_PASSWORD!);
    const joiner = await login(joinerContext, 'carol@ping.dev', SEED_PASSWORD);

    const server = (await (
      await ownerContext.request.post(`${API}/servers`, {
        headers: owner.headers,
        data: { name: `Invite ${randomUUID().slice(0, 8)}` },
      })
    ).json()) as ServerDetail;
    const serverId = server.id;
    const originalCode = server.inviteCode;

    const settings = `/servers/${serverId}/settings`;
    const ownerPage = await ownerContext.newPage();
    await ownerPage.goto(settings);
    await expect(ownerPage.getByRole('heading', { name: 'Cài đặt server' })).toBeVisible();

    const inviteSection = ownerPage.getByTestId('invite-section');
    await expect(inviteSection).toBeVisible();
    await expect(inviteSection.getByTestId('invite-code')).toHaveText(originalCode);
    await expect(inviteSection.locator('span', { hasText: 'Không hạn dùng' })).toBeVisible();

    await test.step('tạo mã mới có hạn dùng qua UI → mã cũ trả INVITE_REVOKED', async () => {
      await inviteSection.getByLabel('Hạn dùng của mã mới').click();
      await ownerPage.locator('.ant-select-item-option', { hasText: 'Hết hạn sau 7 ngày' }).click();
      await inviteSection.getByRole('button', { name: 'Tạo mã mới' }).click();
      await visiblePopconfirm(ownerPage).getByRole('button', { name: 'Tạo mã mới' }).click();

      await expect(ownerPage.getByText(/Đã tạo mã mời mới:/)).toBeVisible();
      // Cache server được invalidate và refetch — đợi mã mới hiển thị rồi mới đọc.
      await expect(inviteSection.getByTestId('invite-code')).not.toHaveText(originalCode, {
        timeout: 10_000,
      });
      const newCode = (await inviteSection.getByTestId('invite-code').textContent()) ?? '';
      await expect(inviteSection.getByText(/Hết hạn:/)).toBeVisible();

      // Mã cũ bị thu hồi: API trả 410 + mã lỗi riêng, không phải 404 chung chung.
      const oldJoin = await ownerContext.request.post(`${API}/servers/join`, {
        headers: joiner.headers,
        data: { inviteCode: originalCode },
      });
      expect(oldJoin.status()).toBe(410);
      expect(((await oldJoin.json()) as { code: string }).code).toBe('INVITE_REVOKED');

      await test.step('join bằng mã thu hồi qua UI hiện đúng thông báo', async () => {
        const joinerPage = await joinerContext.newPage();
        await joinerPage.goto('/');
        await joinerPage.getByRole('button', { name: 'Tham gia server' }).click();
        await joinerPage.getByLabel('Mã mời').fill(originalCode);
        await joinerPage.getByRole('button', { name: 'Tham gia', exact: true }).click();
        await expect(joinerPage.getByText('Mã mời đã bị thu hồi.')).toBeVisible();
      });

      await test.step('join bằng mã mới qua UI vào được server', async () => {
        const joinerPage = await joinerContext.newPage();
        await joinerPage.goto('/');
        await joinerPage.getByRole('button', { name: 'Tham gia server' }).click();
        await joinerPage.getByLabel('Mã mời').fill(newCode);
        await joinerPage.getByRole('button', { name: 'Tham gia', exact: true }).click();
        await expect(joinerPage).toHaveURL(new RegExp(`/servers/${serverId}`), {
          timeout: 15_000,
        });
      });
    });

    await test.step('owner xoá server riêng của test', async () => {
      const deleted = await ownerContext.request.delete(`${API}/servers/${serverId}`, {
        headers: owner.headers,
      });
      expect(deleted.ok()).toBeTruthy();
    });
  } finally {
    await ownerContext.close();
    await joinerContext.close();
  }
});
