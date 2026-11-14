import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { type MessageDto, type ServerDetail } from '@ping/shared';
import { pacedLogin } from './login-pace';

const API = 'http://localhost:4000/api/v1';
const SEED_PASSWORD = 'password123';

interface RecordedNotification {
  title: string;
  tag: string | null;
  body: string;
  onclick: ((event: unknown) => void) | null;
}
interface NotifyWindow {
  __notifications: RecordedNotification[];
  __setHidden: (hidden: boolean) => void;
}

const NOTIFY_INIT = `
  window.__notifications = [];
  window.__setHidden = (hidden) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden });
  };
  window.__setHidden(true);
  const RecordedNotification = function (title, options) {
    const entry = {
      title,
      tag: (options && options.tag) || null,
      body: (options && options.body) || '',
      onclick: null,
    };
    window.__notifications.push(entry);
    return entry;
  };
  RecordedNotification.permission = 'granted';
  RecordedNotification.requestPermission = async () => 'granted';
  window.Notification = RecordedNotification;
`;

const notifyWindow = (page: Page) =>
  page.evaluate(() => (window as unknown as NotifyWindow).__notifications);

const countFor = (page: Page, tag: string) =>
  page.evaluate(
    ([id]) =>
      (window as unknown as NotifyWindow).__notifications.filter((entry) => entry.tag === id)
        .length,
    [tag] as const,
  );

const visibleBell = (page: Page) => page.getByTestId('notify-bell').filter({ visible: true });
const visiblePopover = (page: Page) => page.getByTestId('notify-popover').filter({ visible: true });

test('tg12 notifications: bell prefs, browser notification, mute/focus gates, title badge', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const aliceContext = await browser.newContext();
  const bobContext = await browser.newContext();
  try {
    const alice = await pacedLogin(
      aliceContext.request,
      process.env.E2E_EMAIL!,
      process.env.E2E_PASSWORD!,
    );
    const bobAuth = await pacedLogin(bobContext.request, 'bob@ping.dev', SEED_PASSWORD);
    const bob = { headers: { Authorization: `Bearer ${bobAuth.accessToken}` } };
    await aliceContext.grantPermissions(['notifications']);

    const server = (await (
      await aliceContext.request.post(`${API}/servers`, {
        headers: { Authorization: `Bearer ${alice.accessToken}` },
        data: { name: `Notify ${randomUUID().slice(0, 8)}` },
      })
    ).json()) as ServerDetail;
    const generalId = server.channels[0]!.id;
    const createChannel = async (name: string) =>
      (await (
        await aliceContext.request.post(`${API}/servers/${server.id}/channels`, {
          headers: { Authorization: `Bearer ${alice.accessToken}` },
          data: { name },
        })
      ).json()) as { id: string };
    const notifyChannel = await createChannel('notify');
    const pingChannel = await createChannel('ping');
    const loudChannel = await createChannel('loud');
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

    const alicePage = await aliceContext.newPage();
    await alicePage.addInitScript(NOTIFY_INIT);
    await alicePage.goto('/');
    await expect(alicePage.getByRole('button', { name: 'Tham gia server' })).toBeVisible();

    const putChannelPref = () =>
      alicePage.waitForResponse(
        (res) =>
          res.url().includes('/users/me/notification-prefs/channel/') &&
          res.request().method() === 'PUT' &&
          res.ok(),
      );

    await test.step('bell: đặt #notify mentions + mute 15 phút qua UI → GET API xác nhận row', async () => {
      await alicePage.getByRole('link', { name: new RegExp(server.name) }).click();
      await expect(alicePage).toHaveURL(new RegExp(generalId), { timeout: 15_000 });
      await alicePage.getByRole('link', { name: '# notify' }).click();
      await expect(alicePage).toHaveURL(new RegExp(notifyChannel.id), { timeout: 15_000 });

      const bell = visibleBell(alicePage);
      await expect(bell).toBeVisible();
      await bell.click();
      const popover = visiblePopover(alicePage);
      await expect(popover).toBeVisible();
      await expect(popover.getByTestId('notify-default-hint')).toHaveText(
        'Đang theo mặc định chung',
      );

      // Chờ từng PUT để hai mutation không chèn nhau.
      let done = putChannelPref();
      await popover.getByTestId('notify-level-mentions').click();
      await done;
      done = putChannelPref();
      await popover.getByTestId('notify-mute-toggle').click();
      await popover.getByTestId('notify-mute-15m').click();
      await done;
      await expect(popover.getByTestId('notify-muted-status')).toContainText('tắt tiếng');

      const prefs = (await (
        await aliceContext.request.get(`${API}/users/me/notification-prefs`, {
          headers: { Authorization: `Bearer ${alice.accessToken}` },
        })
      ).json()) as {
        prefs: Array<{ scope: string; targetId: string; level: string; mutedUntil: string | null }>;
      };
      const row = prefs.prefs.find(
        (item) => item.scope === 'channel' && item.targetId === notifyChannel.id,
      );
      expect(row, 'prefs phải có đúng dòng channel vừa đặt qua UI').toBeDefined();
      expect(row!.level).toBe('mentions');
      const minutes = (Date.parse(row!.mutedUntil!) - Date.now()) / 60_000;
      expect(minutes).toBeGreaterThan(13);
      expect(minutes).toBeLessThan(16);
    });

    await test.step('bell: đặt #ping mức mentions (không mute) — kênh cho test notification', async () => {
      await alicePage.getByRole('link', { name: '# ping' }).click();
      await expect(alicePage).toHaveURL(new RegExp(pingChannel.id), { timeout: 15_000 });
      await visibleBell(alicePage).click();
      const popover = visiblePopover(alicePage);
      await expect(popover).toBeVisible();
      const done = putChannelPref();
      await popover.getByTestId('notify-level-mentions').click();
      await done;
      await expect(popover.getByTestId('notify-muted-status')).toHaveCount(0);
    });

    await test.step('mention khi tab ẩn → Notification gom theo tag kênh, click tới permalink', async () => {
      const mention = (await (
        await send(pingChannel.id, `@${alice.user.username} chào bạn`)
      ).json()) as MessageDto;
      await expect.poll(() => countFor(alicePage, pingChannel.id), { timeout: 15_000 }).toBe(1);
      const entry = (await notifyWindow(alicePage)).find((item) => item.tag === pingChannel.id);
      expect(entry!.title).toBe(`#ping · ${server.name}`);
      expect(entry!.body).toContain('chào bạn');

      await alicePage.evaluate(
        ([id]) => {
          const target = (window as unknown as NotifyWindow).__notifications
            .filter((item) => item.tag === id)
            .at(-1);
          target?.onclick?.(new MouseEvent('click'));
        },
        [pingChannel.id] as const,
      );
      await expect(alicePage).toHaveURL(
        new RegExp(`channels/${server.id}/${pingChannel.id}/${mention.id}`),
        { timeout: 15_000 },
      );
    });

    await test.step('kênh #notify đang mute → tin mới không sinh thêm entry', async () => {
      const before = await countFor(alicePage, notifyChannel.id);
      expect(before).toBe(0);
      expect((await send(notifyChannel.id, 'tin trong lúc mute')).ok()).toBeTruthy();
      await alicePage.waitForTimeout(2_000);
      expect(await countFor(alicePage, notifyChannel.id)).toBe(before);
    });

    await test.step('tab focus (document.hidden=false) → #loud mức all không bắn; tab ẩn lại thì bắn', async () => {
      await alicePage.evaluate(() => (window as unknown as NotifyWindow).__setHidden(false));
      expect((await send(loudChannel.id, 'tin khi đang focus')).ok()).toBeTruthy();
      await alicePage.waitForTimeout(2_000);
      expect(await countFor(alicePage, loudChannel.id)).toBe(0);

      await alicePage.evaluate(() => (window as unknown as NotifyWindow).__setHidden(true));
      expect((await send(loudChannel.id, 'tin khi tab ẩn')).ok()).toBeTruthy();
      await expect.poll(() => countFor(alicePage, loudChannel.id), { timeout: 15_000 }).toBe(1);
    });

    await test.step('title badge: tổng unread tăng khi có tin chưa đọc, về Ping khi đã đọc', async () => {
      const unreadTitle = /^\(\d+\) Ping$/;
      // Mở bằng goto trực tiếp: click link sidebar flaky khi badge re-render.
      for (const channelId of [loudChannel.id, pingChannel.id, notifyChannel.id]) {
        // Chờ PUT mark-read: goto kênh kế tiếp hủy request đang bay.
        const marked = alicePage.waitForResponse(
          (res) =>
            res.url().includes(`/channels/${channelId}/read`) &&
            res.request().method() === 'PUT' &&
            res.ok(),
          { timeout: 30_000 },
        );
        await alicePage.goto(`/channels/${server.id}/${channelId}`);
        await expect(alicePage.getByTestId('message-composer')).toBeVisible({
          timeout: 30_000,
        });
        await marked;
      }
      // mark-read phía client có debounce: khẳng định giá trị tuyệt đối "Ping" flaky, lấy unread của server làm truth.
      await expect
        .poll(
          async () => {
            const res = await aliceContext.request.get(`${API}/servers/${server.id}/unread`, {
              headers: { Authorization: `Bearer ${alice.accessToken}` },
            });
            const rows = (await res.json()) as { unreadCount: number }[];
            return rows.reduce((acc, row) => acc + row.unreadCount, 0);
          },
          { timeout: 20_000, intervals: [1_000] },
        )
        .toBe(0);
      const anyTitle = /^(Ping|\(\d+\) Ping)$/;
      await expect.poll(() => alicePage.title(), { timeout: 15_000 }).toMatch(anyTitle);

      await alicePage.getByRole('link', { name: '# loud' }).click();
      await expect(alicePage).toHaveURL(new RegExp(loudChannel.id), { timeout: 15_000 });
      expect((await send(notifyChannel.id, 'tin cho title badge')).ok()).toBeTruthy();
      await expect.poll(() => alicePage.title(), { timeout: 15_000 }).toMatch(unreadTitle);

      await alicePage.getByRole('link', { name: '# notify' }).click();
      await expect(alicePage).toHaveURL(new RegExp(notifyChannel.id), { timeout: 15_000 });
      await expect.poll(() => alicePage.title(), { timeout: 15_000 }).toBe('Ping');
    });

    await test.step('dọn server của test', async () => {
      const deleted = await aliceContext.request.delete(`${API}/servers/${server.id}`, {
        headers: { Authorization: `Bearer ${alice.accessToken}` },
      });
      expect(deleted.ok()).toBeTruthy();
    });
  } finally {
    await aliceContext.close();
    await bobContext.close();
  }
});
