import { randomUUID } from 'node:crypto';
import { expect, test, type Page, type Request } from '@playwright/test';
import { type ServerDetail } from '@ping/shared';
import { pacedLogin } from './login-pace';

const API = 'http://localhost:4000/api/v1';
const SEED_PASSWORD = 'password123';

/** Throttle toàn cục 100 req/phút/IP trả 429 và block 60 s: gặp 429 thì chờ theo `Retry-After` rồi mở lại, quá 150 s mới là lỗi thật. */
async function openWithUnread(page: Page) {
  const deadline = Date.now() + 150_000;
  for (;;) {
    const unread = page
      .waitForResponse((res) => res.url().includes('/users/me/unread'), {
        timeout: 30_000,
      })
      .catch(() => null);
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Tham gia server' })).toBeVisible();
    const response = await unread;
    if (response?.ok()) return;
    if (Date.now() > deadline) {
      throw new Error(`unread không nạp được (lần cuối: ${response?.status() ?? 'timeout'})`);
    }
    const retryAfter = Number(response?.headers()['retry-after'] ?? 0);
    await page.waitForTimeout(Math.min(70_000, Math.max(2_000, retryAfter * 1_000 + 1_000)));
  }
}

test('unread ui: server/channel badges, mention badge, title, divider and two-tab sync', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const ownerContext = await browser.newContext();
  const bobContext = await browser.newContext();
  try {
    const login = async (context: typeof ownerContext, email: string, password: string) =>
      pacedLogin(context.request, email, password);

    const owner = await login(ownerContext, process.env.E2E_EMAIL!, process.env.E2E_PASSWORD!);
    const bobAuth = await login(bobContext, 'bob@ping.dev', SEED_PASSWORD);
    const bob = { auth: bobAuth, headers: { Authorization: `Bearer ${bobAuth.accessToken}` } };

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

    const tabA = await ownerContext.newPage();
    // Chờ unread của server test nạp xong trước khi bob gửi: event giữa lúc query bay bị fetch đó ghi đè.
    await openWithUnread(tabA);
    // Title là tổng unread toàn cục: đo THEO DELTA so với baseline, không khẳng định số tuyệt đối.
    await expect.poll(() => tabA.title(), { timeout: 10_000 }).toMatch(/^(Ping|\(\d+\) Ping)$/);
    const baseTitle = await tabA.title();
    const titleFor = (n: number) => {
      const base = Number(/^\((\d+)\) Ping$/.exec(baseTitle)?.[1] ?? 0) + n;
      return base === 0 ? 'Ping' : `(${base}) Ping`;
    };
    const testServerLink = tabA.getByRole('link', { name: new RegExp(server.name) });
    await expect(testServerLink).toBeVisible();

    await test.step('tin mới ở kênh không xem → badge server + title (1) (TG.12: title theo tổng unread)', async () => {
      expect((await send(randomChannel, 'tin thứ nhất')).ok()).toBeTruthy();
      await expect(
        tabA.getByRole('link', { name: new RegExp(`${server.name}, 1 tin chưa đọc`) }),
      ).toBeVisible({ timeout: 10_000 });
      await expect.poll(() => tabA.title(), { timeout: 10_000 }).toBe(titleFor(1));
    });

    await test.step('mention → badge đỏ, title (2) (1 unread cũ + mention), aria-live đọc lên', async () => {
      expect((await send(randomChannel, `@${owner.user.username} chào`)).ok()).toBeTruthy();
      await expect(
        tabA.getByRole('link', { name: new RegExp(`${server.name}, 1 lượt nhắc bạn`) }),
      ).toBeVisible({ timeout: 10_000 });
      await expect.poll(() => tabA.title(), { timeout: 10_000 }).toBe(titleFor(2));
      await expect(tabA.getByTestId('mention-announcer')).toHaveText(/nhắc/, {
        timeout: 10_000,
      });
    });

    await test.step('vào server → badge kênh #random; mở kênh → sạch', async () => {
      await tabA.getByRole('link', { name: new RegExp(server.name) }).click();
      await expect(tabA).toHaveURL(new RegExp(generalId), { timeout: 15_000 });
      const randomLink = tabA.getByRole('link', { name: '# random' });
      await expect(randomLink.getByTestId('mention-badge')).toBeVisible();
      await expect(randomLink.getByTestId('mention-badge')).toHaveText('1');

      let readPuts = 0;
      const countRead = (request: Request) => {
        if (
          request.method() === 'PUT' &&
          request.url().includes(`/channels/${randomChannel}/read`)
        ) {
          readPuts += 1;
        }
      };
      tabA.on('request', countRead);

      await randomLink.click();
      await expect(tabA).toHaveURL(new RegExp(randomChannel), { timeout: 15_000 });
      await expect(randomLink.getByTestId('mention-badge')).toHaveCount(0, { timeout: 10_000 });
      await expect(randomLink.getByTestId('unread-badge')).toHaveCount(0);
      await expect.poll(() => tabA.title(), { timeout: 10_000 }).toBe(titleFor(0));
      await expect.poll(() => readPuts, { timeout: 10_000 }).toBe(1);
      // Giữ thêm một nhịp: request lặp (nếu có) đến ngay sau request đầu.
      await tabA.waitForTimeout(1_500);
      expect(readPuts, 'chỉ một PUT /read cho cùng một tin cuối').toBe(1);
      tabA.off('request', countRead);
    });

    await test.step('vạch Tin mới: đọc rồi có tin mới → vào lại thấy vạch trên tin mới', async () => {
      await tabA.getByRole('link', { name: '# general' }).click();
      await expect(tabA).toHaveURL(new RegExp(generalId), { timeout: 15_000 });
      expect((await send(randomChannel, 'tin sau khi đã đọc')).ok()).toBeTruthy();
      const randomLink = tabA.getByRole('link', { name: '# random' });
      await expect(randomLink.getByTestId('unread-badge')).toHaveText('1', {
        timeout: 10_000,
      });

      await randomLink.click();
      await expect(tabA).toHaveURL(new RegExp(randomChannel), { timeout: 15_000 });
      await expect(tabA.getByText('Tin mới').first()).toBeVisible({ timeout: 10_000 });
      await expect(randomLink.getByTestId('unread-badge')).toHaveCount(0, { timeout: 10_000 });
    });

    await test.step('hai tab: đọc ở tab này xóa badge ở tab kia (read.updated)', async () => {
      const tabB = await ownerContext.newPage();
      await openWithUnread(tabB);
      await expect(tabB.getByRole('link', { name: new RegExp(server.name) })).toBeVisible({
        timeout: 15_000,
      });

      await tabA.getByRole('link', { name: '# general' }).click();
      await expect(tabA).toHaveURL(new RegExp(generalId), { timeout: 15_000 });
      expect((await send(randomChannel, 'tin cho hai tab')).ok()).toBeTruthy();
      await expect(
        tabB.getByRole('link', { name: new RegExp(`${server.name}, 1 tin chưa đọc`) }),
      ).toBeVisible({ timeout: 15_000 });
      await expect.poll(() => tabB.title(), { timeout: 10_000 }).toBe(titleFor(1));

      await tabA.getByRole('link', { name: '# random' }).click();
      await expect(tabA).toHaveURL(new RegExp(randomChannel), { timeout: 15_000 });
      await expect(
        tabB.getByRole('link', { name: new RegExp(`${server.name}, 1 tin chưa đọc`) }),
      ).toHaveCount(0, { timeout: 15_000 });
      await expect.poll(() => tabB.title(), { timeout: 10_000 }).toBe(titleFor(0));
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
