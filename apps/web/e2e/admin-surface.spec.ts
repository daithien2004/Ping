import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import type { AuthResponse, RoleDto, ServerDetail } from '@ping/shared';

const API = 'http://localhost:4000/api/v1';

/**
 * Hộp xác nhận (Popconfirm) đang mở. antd giữ popup đã đóng trong DOM nên phải lọc theo
 * phần tử đang hiện, nếu không sẽ bấm nhầm nút của hộp xác nhận đã đóng.
 */
const visiblePopconfirm = (page: Page) => page.locator('.ant-popconfirm').filter({ visible: true });

// TF.10: bề mặt quản trị dựng bằng bộ Ping* — nhật ký hành động theo quyền, sửa quyền
// vai trò bằng nhóm checkbox, xoá vai trò phải xác nhận, chi tiết thành viên trong drawer.
test('admin surface: audit log follows permissions, role permissions save, dangerous actions confirm', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const owner = await browser.newContext();
  const member = await browser.newContext();
  try {
    const suffix = randomUUID().slice(0, 8);
    const ownerAuth = (await (
      await owner.request.post(`${API}/auth/login`, {
        data: { email: process.env.E2E_EMAIL, password: process.env.E2E_PASSWORD },
      })
    ).json()) as AuthResponse;
    const memberAuth = (await (
      await member.request.post(`${API}/auth/register`, {
        data: {
          email: `admin-${suffix}@example.test`,
          username: `admin_${suffix}`,
          password: 'e2e-password',
        },
      })
    ).json()) as AuthResponse;
    const ownerHeaders = { Authorization: `Bearer ${ownerAuth.accessToken}` };
    const memberHeaders = { Authorization: `Bearer ${memberAuth.accessToken}` };
    const serverId = process.env.E2E_SERVER_ID!;
    const server = (await (
      await owner.request.get(`${API}/servers/${serverId}`, { headers: ownerHeaders })
    ).json()) as ServerDetail;
    expect(
      (
        await member.request.post(`${API}/servers/join`, {
          headers: memberHeaders,
          data: { inviteCode: server.inviteCode },
        })
      ).ok(),
    ).toBeTruthy();

    const ownerPage = await owner.newPage();
    const memberPage = await member.newPage();
    const settings = `/servers/${serverId}/settings`;

    await test.step('owner thấy bề mặt quản trị; member thường không thấy mục nhật ký', async () => {
      await ownerPage.goto(settings);
      await expect(ownerPage.getByRole('heading', { name: 'Cài đặt server' })).toBeVisible();
      await expect(ownerPage.getByRole('region', { name: 'Vai trò' })).toBeVisible();
      await expect(ownerPage.getByRole('region', { name: 'Thành viên' })).toBeVisible();
      await expect(ownerPage.getByRole('region', { name: 'Nhật ký hành động' })).toBeVisible();

      await memberPage.goto(settings);
      await expect(memberPage.getByRole('heading', { name: 'Cài đặt server' })).toBeVisible();
      await expect(memberPage.getByRole('region', { name: 'Nhật ký hành động' })).toHaveCount(0);
      // Member không có quyền quản trị nào thì không thấy lối vào từ sidebar.
      await expect(memberPage.getByRole('button', { name: 'Cài đặt' })).toHaveCount(0);
    });

    await test.step('API chặn member chưa có quyền xem nhật ký', async () => {
      const response = await member.request.get(`${API}/servers/${serverId}/audit-log`, {
        headers: memberHeaders,
      });
      expect(response.status()).toBe(403);
    });

    await test.step('cấp quyền xem nhật ký → mục nhật ký hiện ra cho member', async () => {
      const roles = (await (
        await owner.request.get(`${API}/servers/${serverId}/roles`, { headers: ownerHeaders })
      ).json()) as RoleDto[];
      const everyone = roles.find((role) => role.isDefault)!;
      // VIEW_CHANNEL | SEND_MESSAGES | VIEW_AUDIT_LOG
      expect(
        (
          await owner.request.patch(`${API}/roles/${everyone.id}`, {
            headers: ownerHeaders,
            data: { permissions: '259' },
          })
        ).ok(),
      ).toBeTruthy();
      try {
        await memberPage.reload();
        await expect(memberPage.getByRole('region', { name: 'Nhật ký hành động' })).toBeVisible();
        const allowed = await member.request.get(`${API}/servers/${serverId}/audit-log`, {
          headers: memberHeaders,
        });
        expect(allowed.status()).toBe(200);
      } finally {
        // Khôi phục @everyone cho các spec sau.
        expect(
          (
            await owner.request.patch(`${API}/roles/${everyone.id}`, {
              headers: ownerHeaders,
              data: { permissions: '3' },
            })
          ).ok(),
        ).toBeTruthy();
      }
    });

    await test.step('sửa quyền vai trò bằng nhóm checkbox rồi lưu', async () => {
      const role = (await (
        await owner.request.post(`${API}/servers/${serverId}/roles`, {
          headers: ownerHeaders,
          data: { name: `admin-${suffix}`, permissions: '1' },
        })
      ).json()) as RoleDto;

      await ownerPage.reload();
      await ownerPage
        .getByRole('row', { name: new RegExp(`admin-${suffix}`) })
        .getByRole('button', { name: 'Sửa' })
        .click();

      const auditBox = ownerPage.getByRole('checkbox', { name: 'Xem nhật ký hành động' });
      await expect(auditBox).not.toBeChecked();
      await auditBox.click();
      await ownerPage.getByRole('button', { name: 'Lưu' }).click();
      await expect(ownerPage.getByText('Đã lưu vai trò.')).toBeVisible();

      const roles = (await (
        await owner.request.get(`${API}/servers/${serverId}/roles`, { headers: ownerHeaders })
      ).json()) as RoleDto[];
      const saved = roles.find((item) => item.id === role.id)!;
      // VIEW_CHANNEL | VIEW_AUDIT_LOG
      expect(BigInt(saved.permissions)).toBe(257n);
    });

    await test.step('xoá vai trò phải xác nhận', async () => {
      await ownerPage.getByRole('button', { name: 'Xoá vai trò' }).click();
      await expect(ownerPage.getByText('Xoá vai trò này?')).toBeVisible();
      await visiblePopconfirm(ownerPage).getByRole('button', { name: 'Xoá' }).click();
      await expect(ownerPage.getByText('Đã xoá vai trò.')).toBeVisible();

      const roles = (await (
        await owner.request.get(`${API}/servers/${serverId}/roles`, { headers: ownerHeaders })
      ).json()) as RoleDto[];
      expect(roles.some((item) => item.name === `admin-${suffix}`)).toBe(false);
    });

    await test.step('xem chi tiết thành viên trong drawer', async () => {
      await ownerPage
        .getByRole('region', { name: 'Thành viên' })
        .getByRole('button', { name: 'Chi tiết' })
        .first()
        .click();
      const drawer = ownerPage.getByRole('dialog');
      await expect(drawer).toBeVisible();
      await expect(drawer.getByText('Tên người dùng')).toBeVisible();
      await expect(drawer.getByText('Ngày tham gia')).toBeVisible();
      await ownerPage.keyboard.press('Escape');
      await expect(drawer).toHaveCount(0);
    });

    await test.step('vùng nguy hiểm: xoá server phải xác nhận', async () => {
      const danger = ownerPage.getByRole('region', { name: 'Vùng nguy hiểm' });
      await expect(danger).toBeVisible();
      await danger.getByRole('button', { name: 'Xoá server' }).click();
      await expect(ownerPage.getByText('Xoá server này?')).toBeVisible();
      // Hủy: server phải còn nguyên. Popup đã đóng vẫn nằm trong DOM nên kiểm tra
      // phần tử đang hiện, không kiểm tra số phần tử có chứa câu hỏi.
      await visiblePopconfirm(ownerPage).getByRole('button', { name: 'Hủy' }).click();
      await expect(visiblePopconfirm(ownerPage)).toHaveCount(0);
    });
  } finally {
    await owner.close();
    await member.close();
  }
});
