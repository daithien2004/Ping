import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import {
  Permissions,
  type AuthResponse,
  type MemberDto,
  type RoleDto,
  type ServerDetail,
} from '@ping/shared';
import { pacedLogin } from './login-pace';

const API = 'http://localhost:4000/api/v1';

/**
 * T3.3: tạo vai trò, đổi thứ tự hiển thị, gán vai trò cho thành viên.
 * Server riêng cho test này để không đụng dữ liệu của các spec khác; xoá ở cuối.
 */
test('admin roles: create, reorder, assign, realtime permissions and hierarchy guard', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const ownerContext = await browser.newContext();
  const memberContext = await browser.newContext();
  const managerContext = await browser.newContext();
  const plainContext = await browser.newContext();
  try {
    const suffix = randomUUID().slice(0, 8);
    const ownerAuth = await pacedLogin(
      ownerContext.request,
      process.env.E2E_EMAIL!,
      process.env.E2E_PASSWORD!,
    );
    const ownerHeaders = { Authorization: `Bearer ${ownerAuth.accessToken}` };

    const register = async (context: typeof ownerContext, prefix: string) => {
      const auth = (await (
        await context.request.post(`${API}/auth/register`, {
          data: {
            email: `${prefix}-${suffix}@example.test`,
            username: `${prefix}_${suffix}`,
            password: 'e2e-password',
          },
        })
      ).json()) as AuthResponse;
      return { auth, headers: { Authorization: `Bearer ${auth.accessToken}` } };
    };
    const member = await register(memberContext, 'roleMember');
    const manager = await register(managerContext, 'roleManager');
    const plain = await register(plainContext, 'rolePlain');

    const server = (await (
      await ownerContext.request.post(`${API}/servers`, {
        headers: ownerHeaders,
        data: { name: `Roles ${suffix}` },
      })
    ).json()) as ServerDetail;
    const serverId = server.id;
    for (const user of [member, manager, plain]) {
      const joined = await ownerContext.request.post(`${API}/servers/join`, {
        headers: user.headers,
        data: { inviteCode: server.inviteCode },
      });
      expect(joined.ok()).toBeTruthy();
    }

    const createRole = async (name: string, permissions: bigint, position: number) => {
      const response = await ownerContext.request.post(`${API}/servers/${serverId}/roles`, {
        headers: ownerHeaders,
        data: { name, permissions: permissions.toString(), position },
      });
      expect(response.ok()).toBeTruthy();
      return (await response.json()) as RoleDto;
    };
    const strongRole = await createRole(`strong-${suffix}`, Permissions.ADMINISTRATOR, 1);
    const managerRole = await createRole(
      `manager-${suffix}`,
      Permissions.VIEW_CHANNEL | Permissions.SEND_MESSAGES | Permissions.MANAGE_ROLES,
      2,
    );
    await createRole(`reader-${suffix}`, Permissions.VIEW_CHANNEL, 3);
    await createRole(`order-${suffix}`, Permissions.VIEW_CHANNEL, 4);

    const memberIdOf = async (userId: string) => {
      const page = (await (
        await ownerContext.request.get(`${API}/servers/${serverId}/members?limit=100`, {
          headers: ownerHeaders,
        })
      ).json()) as { members: MemberDto[] };
      return page.members.find((item) => item.userId === userId)!.id;
    };
    expect(
      (
        await ownerContext.request.put(
          `${API}/servers/${serverId}/members/${await memberIdOf(manager.auth.user.id)}/roles`,
          { headers: ownerHeaders, data: { roleIds: [managerRole.id] } },
        )
      ).ok(),
    ).toBeTruthy();

    const settings = `/servers/${serverId}/settings`;
    const ownerPage = await ownerContext.newPage();
    const memberPage = await memberContext.newPage();
    const managerPage = await managerContext.newPage();

    await ownerPage.goto(settings);
    await expect(ownerPage.getByRole('heading', { name: 'Cài đặt server' })).toBeVisible();
    const rolesRegion = ownerPage.getByRole('region', { name: 'Vai trò' });

    await test.step('tạo vai trò qua UI với nhóm quyền dễ hiểu', async () => {
      await rolesRegion.getByRole('button', { name: 'Tạo vai trò' }).click();
      const modal = ownerPage.getByRole('dialog');
      await expect(modal).toBeVisible();
      await modal.getByRole('textbox', { name: 'Tên vai trò' }).fill(`audit-${suffix}`);
      await modal.getByRole('checkbox', { name: 'Xem nhật ký hành động' }).click();
      await modal.getByRole('button', { name: 'Tạo' }).click();
      await expect(ownerPage.getByText('Đã tạo vai trò.')).toBeVisible();
      await expect(
        rolesRegion.getByRole('row', { name: new RegExp(`audit-${suffix}`) }),
      ).toBeVisible();

      const roles = (await (
        await ownerContext.request.get(`${API}/servers/${serverId}/roles`, {
          headers: ownerHeaders,
        })
      ).json()) as RoleDto[];
      const created = roles.find((role) => role.name === `audit-${suffix}`)!;
      expect(BigInt(created.permissions)).toBe(Permissions.VIEW_AUDIT_LOG);
      expect(created.position).toBe(5);
    });

    await test.step('đổi thứ tự hiển thị bằng nút lên/xuống', async () => {
      const orderName = `order-${suffix}`;
      const auditName = `audit-${suffix}`;
      await rolesRegion.getByRole('button', { name: `Đưa ${auditName} lên` }).click();
      await expect
        .poll(async () => {
          const roles = (await (
            await ownerContext.request.get(`${API}/servers/${serverId}/roles`, {
              headers: ownerHeaders,
            })
          ).json()) as RoleDto[];
          return roles
            .filter((role) => [orderName, auditName].includes(role.name))
            .sort((a, b) => a.position - b.position)
            .map((role) => role.name);
        })
        .toEqual([auditName, orderName]);

      // @everyone luôn đứng đầu: không có nút đưa lên.
      await expect(rolesRegion.getByRole('button', { name: 'Đưa @everyone lên' })).toBeDisabled();
    });

    await test.step('thành viên thường chưa thấy nhật ký; gán role qua drawer → realtime mở UI', async () => {
      await memberPage.goto(settings);
      await expect(memberPage.getByText('Bạn không có quyền quản trị server này.')).toBeVisible();
      await expect(memberPage.getByRole('region', { name: 'Nhật ký hành động' })).toHaveCount(0);
      // Chờ socket của member nối xong trước khi owner đổi quyền.
      await memberPage.waitForTimeout(1_500);

      const row = ownerPage
        .getByRole('region', { name: 'Thành viên' })
        .getByRole('row', { name: new RegExp(member.auth.user.displayName) });
      await row.getByRole('button', { name: 'Chi tiết' }).click();
      const drawer = ownerPage.getByRole('dialog');
      await expect(drawer).toBeVisible();
      await drawer.getByRole('checkbox', { name: `audit-${suffix}` }).check();
      await drawer.getByRole('button', { name: 'Lưu' }).click();
      await expect(ownerPage.getByText('Đã cập nhật vai trò thành viên.')).toBeVisible();

      // Không reload: event `permissions.changed` làm mới quyền của member.
      await expect(memberPage.getByRole('region', { name: 'Nhật ký hành động' })).toBeVisible({
        timeout: 15_000,
      });
    });

    await test.step('quản lý role không gán được role mạnh hơn mình (UI + API)', async () => {
      await managerPage.goto(settings);
      await expect(managerPage.getByRole('region', { name: 'Vai trò' })).toBeVisible();

      const row = managerPage
        .getByRole('region', { name: 'Thành viên' })
        .getByRole('row', { name: new RegExp(plain.auth.user.displayName) });
      await row.getByRole('button', { name: 'Chi tiết' }).click();
      const drawer = managerPage.getByRole('dialog');
      await expect(drawer).toBeVisible();
      await expect(
        drawer.getByRole('checkbox', { name: new RegExp(`strong-${suffix}.*vượt quyền của bạn`) }),
      ).toBeDisabled();
      await expect(drawer.getByRole('checkbox', { name: `reader-${suffix}` })).toBeEnabled();

      const denied = await managerContext.request.put(
        `${API}/servers/${serverId}/members/${await memberIdOf(plain.auth.user.id)}/roles`,
        { headers: manager.headers, data: { roleIds: [strongRole.id] } },
      );
      expect(denied.status()).toBe(403);
    });

    await test.step('owner xoá server riêng của test', async () => {
      const deleted = await ownerContext.request.delete(`${API}/servers/${serverId}`, {
        headers: ownerHeaders,
      });
      expect(deleted.ok()).toBeTruthy();
    });
  } finally {
    await ownerContext.close();
    await memberContext.close();
    await managerContext.close();
    await plainContext.close();
  }
});
