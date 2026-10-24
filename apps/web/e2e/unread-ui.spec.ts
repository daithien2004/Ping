import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { type AuthResponse, type ServerDetail } from '@ping/shared';

const API = 'http://localhost:4000/api/v1';
const SEED_PASSWORD = 'password123';

/**
 * T4.3: badge unread trên rail/sidebar, badge mention, vạch "Tin mới", tab title, đồng bộ
 * hai tab qua `read.updated`. Owner = tài khoản E2E (đang ở server khác nên badge hiện rõ),
 * bob = tài khoản seed gửi tin.
 */
test('unread ui: server/channel badges, mention badge, title, divider and two-tab sync', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const ownerContext = await browser.newContext();
  const bobContext = await browser.newContext();
  try {
    const login = async (context: typeof ownerContext, email: string, password: string) => {
      const response = await context.request.post(`${API}/auth/login`, {
        data: { email, password },
      });
      expect(response.ok()).toBeTruthy();
      return (await response.json()) as AuthResponse;
    };

    const owner = await login(ownerContext, process.env.E2E_EMAIL!, process.env.E2E_PASSWORD!);
    const bobAuth = await login(bobContext, 'bob@ping.dev', SEED_PASSWORD);
    const bob = { auth: bobAuth, headers: { Authorization: `Bearer ${bobAuth.accessToken}` } };

    // Server riêng cho test: #general (kênh đầu) và #random (nơi có tin chưa đọc).
    const server = (await (
      await ownerContext.request.post(`${API}/servers`, {
        headers: { Authorization: `Bearer ${owner.accessToken}` },
        data: { name: `Unread ${randomUUID().slice(0, 8)}` },
      })
    ).json()) as ServerDetail;
    const generalId = server.channels[0]!.id;
    const randomChannel = (
      await (
        await ownerContext.request.post(`${API}/servers/${server.id}/channels`, {
          headers: { Authorization: `Bearer ${owner.accessToken}` },
          data: { name: 'random' },
        })
      ).json()
    ).id;
    const joined = await bobContext.request.post(`${API}/servers/join`, {
      headers: bob.headers,
      data: { inviteCode: server.inviteCode },
    });
    expect(joined.ok()).toBeTruthy();

    const send = (channelId: string, content: string) =>
      bobContext.request.post(`${API}/channels/${channelId}/messages`, {
        headers: bob.headers,
        data: { content, nonce: randomUUID() },
      });

    // Owner mở tab A ở server khác (server E2E của global setup) — server test chưa xem.
    const tabA = await ownerContext.newPage();
    await tabA.goto('/');
    await expect(tabA.getByRole('button', { name: 'Tham gia server' })).toBeVisible();
    const testServerLink = tabA.getByRole('link', { name: new RegExp(server.name) });
    // Chưa có tin: link chỉ mang tên server (không kèm số unread).
    await expect(testServerLink).toBeVisible();

    await test.step('tin mới ở kênh không xem → badge server, không đổi title', async () => {
      expect((await send(randomChannel, 'tin thứ nhất')).ok()).toBeTruthy();
      await expect(
        tabA.getByRole('link', { name: new RegExp(`${server.name}, 1 tin chưa đọc`) }),
      ).toBeVisible({ timeout: 10_000 });
      // Chưa có mention: title giữ nguyên "Ping".
      await tabA.waitForTimeout(500);
      expect(await tabA.title()).toBe('Ping');
    });

    await test.step('mention → badge đỏ, title (1), aria-live đọc lên', async () => {
      expect((await send(randomChannel, `@${owner.user.username} chào`)).ok()).toBeTruthy();
      await expect(
        tabA.getByRole('link', { name: new RegExp(`${server.name}, 1 lượt nhắc bạn`) }),
      ).toBeVisible({ timeout: 10_000 });
      await expect.poll(() => tabA.title(), { timeout: 10_000 }).toBe('(1) Ping');
      await expect(tabA.getByTestId('mention-announcer')).toHaveText(/nhắc/, {
        timeout: 10_000,
      });
    });

    await test.step('vào server → badge kênh #random; mở kênh → sạch', async () => {
      await tabA.getByRole('link', { name: new RegExp(server.name) }).click();
      // Auto-redirect vào kênh đầu (#general, không có tin): #random vẫn còn badge mention
      // (đỏ, số 1 — mention thắng unread trong hiển thị). Tên link giữ "# random" ổn định.
      await expect(tabA).toHaveURL(new RegExp(generalId), { timeout: 15_000 });
      const randomLink = tabA.getByRole('link', { name: '# random' });
      await expect(randomLink.getByTestId('mention-badge')).toBeVisible();
      await expect(randomLink.getByTestId('mention-badge')).toHaveText('1');

      // Lần đọc ĐẦU chưa có cursor cũ nên không có vạch; badge sạch sau mark-read.
      await randomLink.click();
      await expect(tabA).toHaveURL(new RegExp(randomChannel), { timeout: 15_000 });
      await expect(randomLink.getByTestId('mention-badge')).toHaveCount(0, { timeout: 10_000 });
      await expect(randomLink.getByTestId('unread-badge')).toHaveCount(0);
      await expect.poll(() => tabA.title(), { timeout: 10_000 }).toBe('Ping');
    });

    await test.step('vạch Tin mới: đọc rồi có tin mới → vào lại thấy vạch trên tin mới', async () => {
      // Rời sang #general rồi bob gửi tin mới vào #random.
      await tabA.getByRole('link', { name: '# general' }).click();
      await expect(tabA).toHaveURL(new RegExp(generalId), { timeout: 15_000 });
      expect((await send(randomChannel, 'tin sau khi đã đọc')).ok()).toBeTruthy();
      const randomLink = tabA.getByRole('link', { name: '# random' });
      await expect(randomLink.getByTestId('unread-badge')).toHaveText('1', {
        timeout: 10_000,
      });

      // Vào lại #random: vạch "Tin mới" ngay trên tin vừa gửi, badge sạch.
      await randomLink.click();
      await expect(tabA).toHaveURL(new RegExp(randomChannel), { timeout: 15_000 });
      await expect(tabA.getByText('Tin mới').first()).toBeVisible({ timeout: 10_000 });
      await expect(randomLink.getByTestId('unread-badge')).toHaveCount(0, { timeout: 10_000 });
    });

    await test.step('hai tab: đọc ở tab này xóa badge ở tab kia (read.updated)', async () => {
      // Tab B mở app ở server khác; tab A đang xem #random.
      const tabB = await ownerContext.newPage();
      await tabB.goto('/');
      await expect(tabB.getByRole('button', { name: 'Tham gia server' })).toBeVisible();

      // Bob gửi tin mới vào #random: tab B thấy badge, tab A (đang xem) mark-read ngay →
      // read.updated đưa badge tab B về sạch.
      expect((await send(randomChannel, 'tin cho hai tab')).ok()).toBeTruthy();
      await expect(tabB.getByRole('link', { name: new RegExp(server.name) })).toBeVisible({
        timeout: 15_000,
      });
      expect(await tabB.title()).toBe('Ping');
    });

    await test.step('dọn server của test', async () => {
      const deleted = await ownerContext.request.delete(`${API}/servers/${server.id}`, {
        headers: { Authorization: `Bearer ${owner.accessToken}` },
      });
      expect(deleted.ok()).toBeTruthy();
    });
  } finally {
    await ownerContext.close();
    await bobContext.close();
  }
});
