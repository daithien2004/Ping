import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import { type MessageDto, type ServerDetail } from '@ping/shared';
import { pacedLogin } from './login-pace';

const API = 'http://localhost:4000/api/v1';
const SEED_PASSWORD = 'password123';

/** Notification ghi lại của test — app bắn qua `new Notification` nên mỗi entry là object trả về. */
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

/**
 * Bọc window.Notification ghi vào `window.__notifications` (không dùng Notification của OS —
 * headless không kiểm được) và đè `document.hidden` qua defineProperty để test xoay imagined
 * focus/hidden: tiêu chí TG.12 là KHÔNG bắn khi document.hidden === false.
 */
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

/** <Activity> giữ trang channel cũ ẩn trong DOM → chuông/popover phải lọc :visible (ADR-0020). */
const visibleBell = (page: Page) => page.getByTestId('notify-bell').filter({ visible: true });
const visiblePopover = (page: Page) => page.getByTestId('notify-popover').filter({ visible: true });

/**
 * TG.12 — thông báo. Một luồng nối tiếp qua step (pacedLogin 2 tài khoản, workers=1):
 * - (a) chuông kênh #notify: mức 'mentions' + mute 15 phút qua UI → GET API thật xác nhận row;
 * - (b) mention khi tab ẩn trên kênh #ping (chưa mute) → Notification gom theo tag kênh,
 *       body trích dẫn, click handler điều hướng tới permalink;
 * - (c) kênh vừa mute → tin mới KHÔNG sinh entry; kênh mức 'all' khi tab focus → KHÔNG sinh
 *       entry (tiêu chí nghiệm thu), tab ẩn lại thì bắn;
 * - (d) title badge: tổng unread tăng khi có tin chưa đọc, về 'Ping' khi đã đọc.
 * #notify bị mute nên mọi notification thật diễn ra trên #ping/#loud.
 */
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
    // Notification API của Chromium cần cấp quyền theo context (app tự kiểm permission trước khi bắn).
    await aliceContext.grantPermissions(['notifications']);

    // Server riêng: #general (kênh đầu), #notify (mute), #ping (mentions), #loud (mặc định all).
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

    /** Mở popover chuông của kênh đang xem + chờ PUT prefs (mutation qua UI). */
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
      // Chưa cấu hình gì: mức hiệu dụng là mặc định chung, có nhãn giải thích.
      await expect(popover.getByTestId('notify-default-hint')).toHaveText(
        'Đang theo mặc định chung',
      );

      // Đặt mức 'mentions' rồi mute 15 phút — chờ từng PUT để hai mutation không chèn nhau.
      let done = putChannelPref();
      await popover.getByTestId('notify-level-mentions').click();
      await done;
      done = putChannelPref();
      await popover.getByTestId('notify-mute-15m').click();
      await done;
      // remaining làm tròn LÊN nên 15 phút + độ trễ hiển thị 16 — chỉ cần dòng trạng thái hiện ra.
      await expect(popover.getByTestId('notify-muted-status')).toContainText('tắt tiếng');

      // GET API thật: row channel đúng id, đúng mức, mute còn ~15 phút.
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
      // Không mute — popover không được hiện dòng "đang tắt tiếng".
      await expect(popover.getByTestId('notify-muted-status')).toHaveCount(0);
    });

    await test.step('mention khi tab ẩn → Notification gom theo tag kênh, click tới permalink', async () => {
      const mention = (await (
        await send(pingChannel.id, `@${alice.user.username} chào bạn`)
      ).json()) as MessageDto;
      await expect.poll(() => countFor(alicePage, pingChannel.id), { timeout: 15_000 }).toBe(1);
      const entry = (await notifyWindow(alicePage)).find((item) => item.tag === pingChannel.id);
      // title `#kênh · server`, body "tác giả: trích dẫn".
      expect(entry!.title).toBe(`#ping · ${server.name}`);
      expect(entry!.body).toContain('chào bạn');

      // Click handler của app: focus + điều hướng tới permalink `…/messages/:id` (TG.5).
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
        new RegExp(`channels/${pingChannel.id}/messages/${mention.id}`),
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

      // Tab ẩn lại: cùng kênh, tin tiếp theo (không mention) vẫn phải tới — gate đúng là hidden.
      await alicePage.evaluate(() => (window as unknown as NotifyWindow).__setHidden(true));
      expect((await send(loudChannel.id, 'tin khi tab ẩn')).ok()).toBeTruthy();
      await expect.poll(() => countFor(alicePage, loudChannel.id), { timeout: 15_000 }).toBe(1);
    });

    await test.step('title badge: tổng unread tăng khi có tin chưa đọc, về Ping khi đã đọc', async () => {
      // Đang có unread: #notify 1 (tin trong lúc mute) + #loud 2 → đọc sạch từng kênh.
      // Số tuyệt đối có thể dao động trong lúc mark-read/refetch đối soát (unread là ước lượng
      // tối thiểu — unread-cache.ts), nên tiêu chí (d) kiểm "badge hiện && về 0 khi đọc".
      const unreadTitle = /^\(\d+\) Ping$/;
      await alicePage.getByRole('link', { name: '# loud' }).click();
      await expect(alicePage).toHaveURL(new RegExp(loudChannel.id), { timeout: 15_000 });
      await expect.poll(() => alicePage.title(), { timeout: 15_000 }).toMatch(unreadTitle);
      await alicePage.getByRole('link', { name: '# notify' }).click();
      await expect(alicePage).toHaveURL(new RegExp(notifyChannel.id), { timeout: 15_000 });
      await expect.poll(() => alicePage.title(), { timeout: 15_000 }).toBe('Ping');

      // Rời #notify rồi bob gửi tin mới: title tăng lại theo unread (kể cả kênh mức mentions —
      // mức thông báo không chặn badge unread của T4.3).
      await alicePage.getByRole('link', { name: '# loud' }).click();
      await expect(alicePage).toHaveURL(new RegExp(loudChannel.id), { timeout: 15_000 });
      expect((await send(notifyChannel.id, 'tin cho title badge')).ok()).toBeTruthy();
      await expect.poll(() => alicePage.title(), { timeout: 15_000 }).toMatch(unreadTitle);

      // Mở kênh → mark-read → title về 'Ping' (favicon cũng khôi phục).
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
