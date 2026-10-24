import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import {
  Permissions,
  type AuthResponse,
  type MemberDto,
  type RoleDto,
  type ServerDetail,
} from '@ping/shared';

const API = 'http://localhost:4000/api/v1';
const SEED_PASSWORD = 'password123';

/** Hộp xác nhận đang mở; antd giữ popup đã đóng trong DOM nên phải lọc theo phần tử đang hiện. */
const visiblePopconfirm = (page: Page) => page.locator('.ant-popconfirm').filter({ visible: true });

/**
 * T3.4: danh sách thành viên, kick có kiểm thứ bậc, hiển thị vai trò.
 *
 * Dùng tài khoản seed (bob/carol/alice) thay vì đăng ký mới: `POST /auth/register` chỉ cho
 * 5 lượt/phút/IP và cả bộ e2e chạy trên cùng một IP — thêm 3 lượt đăng ký ở đây sẽ đẩy các
 * spec chạy sau vào 429. Server riêng cho test này, xoá ở cuối.
 */
test('admin members: role badges, kick hierarchy guard and realtime removal', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const ownerContext = await browser.newContext();
  const kickerContext = await browser.newContext();
  const victimContext = await browser.newContext();
  const strongContext = await browser.newContext();
  try {
    const suffix = randomUUID().slice(0, 8);
    const login = async (context: typeof ownerContext, email: string, password: string) => {
      const response = await context.request.post(`${API}/auth/login`, {
        data: { email, password },
      });
      expect(response.ok()).toBeTruthy();
      const auth = (await response.json()) as AuthResponse;
      return { auth, headers: { Authorization: `Bearer ${auth.accessToken}` } };
    };

    const owner = await login(ownerContext, process.env.E2E_EMAIL!, process.env.E2E_PASSWORD!);
    const kicker = await login(kickerContext, 'bob@ping.dev', SEED_PASSWORD);
    const victim = await login(victimContext, 'carol@ping.dev', SEED_PASSWORD);
    const strong = await login(strongContext, 'alice@ping.dev', SEED_PASSWORD);

    const server = (await (
      await ownerContext.request.post(`${API}/servers`, {
        headers: owner.headers,
        data: { name: `Members ${suffix}` },
      })
    ).json()) as ServerDetail;
    const serverId = server.id;
    for (const user of [kicker, victim, strong]) {
      const joined = await ownerContext.request.post(`${API}/servers/join`, {
        headers: user.headers,
        data: { inviteCode: server.inviteCode },
      });
      expect(joined.ok()).toBeTruthy();
    }

    const memberIdOf = async (userId: string) => {
      const page = (await (
        await ownerContext.request.get(`${API}/servers/${serverId}/members?limit=100`, {
          headers: owner.headers,
        })
      ).json()) as { members: MemberDto[] };
      return page.members.find((item) => item.userId === userId)!.id;
    };
    const createRole = async (name: string, permissions: bigint) => {
      const response = await ownerContext.request.post(`${API}/servers/${serverId}/roles`, {
        headers: owner.headers,
        data: { name, permissions: permissions.toString() },
      });
      expect(response.ok()).toBeTruthy();
      return (await response.json()) as RoleDto;
    };
    const kickerRole = await createRole(
      `kick-${suffix}`,
      Permissions.VIEW_CHANNEL | Permissions.KICK_MEMBERS,
    );
    const strongRole = await createRole(`strong-${suffix}`, Permissions.ADMINISTRATOR);
    for (const [user, role] of [
      [kicker, kickerRole],
      [strong, strongRole],
    ] as const) {
      const assigned = await ownerContext.request.put(
        `${API}/servers/${serverId}/members/${await memberIdOf(user.auth.user.id)}/roles`,
        { headers: owner.headers, data: { roleIds: [role.id] } },
      );
      expect(assigned.ok()).toBeTruthy();
    }

    const settings = `/servers/${serverId}/settings`;
    const kickerPage = await kickerContext.newPage();
    const victimPage = await victimContext.newPage();

    await kickerPage.goto(settings);
    await expect(kickerPage.getByRole('heading', { name: 'Cài đặt server' })).toBeVisible();
    const members = kickerPage.getByRole('region', { name: 'Thành viên' });
    await expect(members).toBeVisible();
    // Chỉ KICK_MEMBERS: không thấy vùng vai trò nhưng vẫn vào được danh sách thành viên.
    await expect(kickerPage.getByRole('region', { name: 'Vai trò' })).toHaveCount(0);

    const rowOf = (name: string) => members.getByRole('row', { name: new RegExp(name) });

    await test.step('hiển thị vai trò và khoá kick theo thứ bậc', async () => {
      await expect(
        rowOf(victim.auth.user.displayName).getByRole('button', { name: /^Kick / }),
      ).toBeEnabled();
      await expect(
        rowOf(owner.auth.user.displayName).getByRole('button', {
          name: /không thể kick chủ server/,
        }),
      ).toBeDisabled();
      await expect(
        rowOf(strong.auth.user.displayName).getByRole('button', {
          name: /thành viên mạnh hơn bạn/,
        }),
      ).toBeDisabled();
      await expect(
        rowOf(kicker.auth.user.displayName).getByRole('button', { name: /không thể tự kick mình/ }),
      ).toBeDisabled();

      // Vai trò hiển thị bằng nhãn (RoleTag) trong cột Vai trò.
      await expect(rowOf(strong.auth.user.displayName).getByText(`strong-${suffix}`)).toBeVisible();
      await expect(rowOf(kicker.auth.user.displayName).getByText(`kick-${suffix}`)).toBeVisible();
    });

    await test.step('API cũng chặn: owner/người mạnh hơn → 403, tự kick → 400', async () => {
      const kick = (memberId: string) =>
        kickerContext.request.delete(`${API}/servers/${serverId}/members/${memberId}`, {
          headers: kicker.headers,
        });

      expect((await kick(await memberIdOf(owner.auth.user.id))).status()).toBe(403);
      expect((await kick(await memberIdOf(strong.auth.user.id))).status()).toBe(403);
      expect((await kick(await memberIdOf(kicker.auth.user.id))).status()).toBe(400);
    });

    await test.step('kick qua UI → realtime đưa người bị kick ra khỏi server', async () => {
      const detail = (await (
        await ownerContext.request.get(`${API}/servers/${serverId}`, { headers: owner.headers })
      ).json()) as ServerDetail;
      await victimPage.goto(`/servers/${serverId}/channels/${detail.channels[0]!.id}`);
      await expect(victimPage.getByRole('link', { name: '# general' })).toBeVisible();
      // Đánh dấu window để chứng minh lần chuyển trang sau đó là điều hướng client, không reload.
      await victimPage.evaluate(() => {
        (window as unknown as { __pingE2E?: string }).__pingE2E = 'alive';
      });
      // Chờ socket của victim nối xong trước khi kick.
      await victimPage.waitForTimeout(1_500);

      await rowOf(victim.auth.user.displayName)
        .getByRole('button', { name: /^Kick / })
        .click();
      await visiblePopconfirm(kickerPage).getByRole('button', { name: 'Kick' }).click();
      await expect(kickerPage.getByText('Đã kick thành viên.')).toBeVisible();
      await expect(rowOf(victim.auth.user.displayName)).toHaveCount(0);

      // Không reload: `member.removed` đưa victim ra khỏi server, app tự chuyển sang server còn lại.
      await expect(victimPage).not.toHaveURL(new RegExp(serverId), { timeout: 15_000 });
      expect(
        await victimPage.evaluate(() => (window as unknown as { __pingE2E?: string }).__pingE2E),
      ).toBe('alive');
      await expect(victimPage.getByRole('link', { name: 'Ping Playground' })).toBeVisible();
    });

    await test.step('owner xoá server riêng của test', async () => {
      const deleted = await ownerContext.request.delete(`${API}/servers/${serverId}`, {
        headers: owner.headers,
      });
      expect(deleted.ok()).toBeTruthy();
    });
  } finally {
    await ownerContext.close();
    await kickerContext.close();
    await victimContext.close();
    await strongContext.close();
  }
});
