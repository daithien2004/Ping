import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import type { AuthResponse, ChannelDto, RoleDto, ServerDetail } from '@ping/shared';

const API = 'http://localhost:4000/api/v1';

// F6: quyền ở UI. Hai phiên riêng: chủ server (A) và thành viên thường (B, chỉ có @everyone).
test('permissions in the UI: menus follow ownership, edit and delete, live permission loss', async ({
  browser,
}) => {
  test.setTimeout(120_000);
  const a = await browser.newContext();
  const b = await browser.newContext();
  try {
    const suffix = randomUUID().slice(0, 8);
    const owner = (await (
      await a.request.post(`${API}/auth/login`, {
        data: { email: process.env.E2E_EMAIL, password: process.env.E2E_PASSWORD },
      })
    ).json()) as AuthResponse;
    const member = (await (
      await b.request.post(`${API}/auth/register`, {
        data: {
          email: `perm-${suffix}@example.test`,
          username: `perm_${suffix}`,
          password: 'e2e-password',
        },
      })
    ).json()) as AuthResponse;
    const ownerAuth = { Authorization: `Bearer ${owner.accessToken}` };
    const memberAuth = { Authorization: `Bearer ${member.accessToken}` };
    const serverId = process.env.E2E_SERVER_ID!;
    const server = (await (
      await a.request.get(`${API}/servers/${serverId}`, { headers: ownerAuth })
    ).json()) as ServerDetail;
    expect(
      (
        await b.request.post(`${API}/servers/join`, {
          headers: memberAuth,
          data: { inviteCode: server.inviteCode },
        })
      ).ok(),
    ).toBeTruthy();
    // Channel riêng cho test này: không lẫn với tin của các spec khác.
    const channel = (await (
      await a.request.post(`${API}/servers/${serverId}/channels`, {
        headers: ownerAuth,
        data: { name: `perm-${suffix}` },
      })
    ).json()) as ChannelDto;
    const send = async (
      context: typeof a,
      auth: Record<string, string>,
      content: string,
    ): Promise<void> => {
      const response = await context.request.post(`${API}/channels/${channel.id}/messages`, {
        headers: auth,
        data: { content, nonce: randomUUID() },
      });
      expect(response.ok()).toBeTruthy();
    };
    await send(a, ownerAuth, `owner says ${suffix}`);
    await send(b, memberAuth, `member says ${suffix}`);

    const path = `/servers/${serverId}/channels/${channel.id}`;
    const pa = await a.newPage();
    const pb = await b.newPage();
    await pa.goto(path);
    await pb.goto(path);
    const row = (page: typeof pa, text: string) =>
      page.locator('article:visible', { hasText: text });
    const menu = (page: typeof pa, text: string) =>
      row(page, text).getByRole('button', { name: 'Thao tác tin nhắn' });

    await test.step('menu thao tác theo quyền: member chỉ có trên tin của mình, owner có trên mọi tin', async () => {
      await expect(row(pb, `owner says ${suffix}`)).toBeVisible();
      await expect(menu(pb, `member says ${suffix}`)).toHaveCount(1);
      await expect(menu(pb, `owner says ${suffix}`)).toHaveCount(0);
      await expect(menu(pa, `owner says ${suffix}`)).toHaveCount(1);
      await expect(menu(pa, `member says ${suffix}`)).toHaveCount(1);
    });

    await test.step('member không thấy nút tạo channel, owner thấy', async () => {
      await expect(pa.getByRole('button', { name: 'Tạo channel' })).toBeVisible();
      await expect(pb.getByRole('button', { name: 'Tạo channel' })).toHaveCount(0);
    });

    await test.step('tin rất dài: hộp sửa không đẩy nút Lưu ra ngoài khung nhìn', async () => {
      const longContent = `long ${suffix} ${'lorem ipsum '.repeat(300)}`.trim();
      await send(a, ownerAuth, longContent);
      await menu(pa, `long ${suffix}`).click();
      await pa.getByRole('menuitem', { name: 'Sửa' }).click();
      const dialog = pa.getByRole('dialog', { name: 'Sửa tin nhắn' });
      await expect(dialog.getByRole('button', { name: 'Lưu' })).toBeInViewport();
      await dialog.getByRole('button', { name: 'Hủy' }).click();
      await expect(dialog).toHaveCount(0);
    });

    await test.step('member sửa tin của mình → cả hai phiên thấy nội dung mới và "(đã sửa)"', async () => {
      await menu(pb, `member says ${suffix}`).click();
      await pb.getByRole('menuitem', { name: 'Sửa' }).click();
      const dialog = pb.getByRole('dialog', { name: 'Sửa tin nhắn' });
      await dialog
        .getByRole('textbox', { name: 'Nội dung tin nhắn' })
        .fill(`member edited ${suffix}`);
      await dialog.getByRole('button', { name: 'Lưu' }).click();
      await expect(dialog).toHaveCount(0);
      for (const page of [pa, pb]) {
        await expect(row(page, `member edited ${suffix}`)).toContainText('(đã sửa)');
      }
    });

    await test.step('owner xóa tin của member sau khi xác nhận → biến mất ở cả hai phiên', async () => {
      await menu(pa, `member edited ${suffix}`).click();
      await pa.getByRole('menuitem', { name: 'Xóa' }).click();
      const dialog = pa.getByRole('dialog', { name: 'Xóa tin nhắn' });
      await expect(dialog).toContainText(`member edited ${suffix}`);
      await dialog.getByRole('button', { name: 'Xóa', exact: true }).click();
      await expect(dialog).toHaveCount(0);
      for (const page of [pa, pb]) {
        await expect(row(page, `member edited ${suffix}`)).toHaveCount(0);
      }
    });

    await test.step('owner thu quyền gửi của @everyone → ô soạn của member biến mất ngay, không cần tải lại', async () => {
      await expect(composer(pb, channel.name)).toBeVisible();
      const roles = (await (
        await a.request.get(`${API}/servers/${serverId}/roles`, { headers: ownerAuth })
      ).json()) as RoleDto[];
      const everyone = roles.find((role) => role.isDefault)!;
      const revoke = await a.request.patch(`${API}/roles/${everyone.id}`, {
        headers: ownerAuth,
        data: { permissions: '1' }, // chỉ VIEW_CHANNEL
      });
      expect(revoke.ok()).toBeTruthy();
      await expect(
        pb.getByText('Bạn không có quyền gửi tin nhắn trong channel này.'),
      ).toBeVisible();
      await expect(composer(pb, channel.name)).toHaveCount(0);
      // Khôi phục cho các spec sau (VIEW_CHANNEL | SEND_MESSAGES).
      expect(
        (
          await a.request.patch(`${API}/roles/${everyone.id}`, {
            headers: ownerAuth,
            data: { permissions: '3' },
          })
        ).ok(),
      ).toBeTruthy();
      await expect(composer(pb, channel.name)).toBeVisible();
    });
  } finally {
    await a.close();
    await b.close();
  }
});

const composer = (page: import('@playwright/test').Page, name: string) =>
  page.getByRole('textbox', { name: `Nhắn #${name}` });
