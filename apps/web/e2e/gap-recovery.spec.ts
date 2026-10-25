import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { type AuthResponse, type ServerDetail } from '@ping/shared';

const API = 'http://localhost:4000/api/v1';
const SEED_PASSWORD = 'password123';

/**
 * T4.4 (ADR-0044): ngắt mạng, client khác gửi 100 tin (+ xóa 1), nối lại → đủ 99 tin còn lại,
 * đúng thứ tự, không trùng, tin đã xóa biến mất — nhờ `?after=` vá khoảng trống thay vì
 * refetch toàn bộ.
 *
 * Nhịp gửi 400 ms/lần và chia 3 tài khoản seed để không chạm hai lớp rate limit:
 * 10 tin/10 s/(user, channel) và 100 req/phút/IP.
 */
test('gap recovery: 100 messages sent while offline are patched in order after reconnect', async ({
  browser,
}) => {
  test.setTimeout(360_000);
  const viewerContext = await browser.newContext();
  const senderContext = await browser.newContext();
  try {
    const login = async (email: string, password: string) => {
      const response = await senderContext.request.post(`${API}/auth/login`, {
        data: { email, password },
      });
      expect(response.ok()).toBeTruthy();
      const auth = (await response.json()) as AuthResponse;
      return { Authorization: `Bearer ${auth.accessToken}` };
    };

    const viewerLogin = await viewerContext.request.post(`${API}/auth/login`, {
      data: { email: process.env.E2E_EMAIL!, password: process.env.E2E_PASSWORD! },
    });
    expect(viewerLogin.ok()).toBeTruthy();
    const viewerAuth = (await viewerLogin.json()) as AuthResponse;
    const viewerHeaders = { Authorization: `Bearer ${viewerAuth.accessToken}` };

    const senders = [
      await login('alice@ping.dev', SEED_PASSWORD),
      await login('bob@ping.dev', SEED_PASSWORD),
      await login('carol@ping.dev', SEED_PASSWORD),
    ];

    const suffix = randomUUID().slice(0, 8);
    const server = (await (
      await senderContext.request.post(`${API}/servers`, {
        headers: senders[0]!,
        data: { name: `Gap ${suffix}` },
      })
    ).json()) as ServerDetail;
    const channelId = server.channels[0]!.id;
    // senders[0] (alice) là người tạo server — chỉ join bob và carol.
    for (const sender of senders.slice(1)) {
      const joined = await senderContext.request.post(`${API}/servers/join`, {
        headers: sender,
        data: { inviteCode: server.inviteCode },
      });
      expect(joined.ok()).toBeTruthy();
    }

    // Viewer tham gia server rồi mở kênh, chờ trạng thái rỗng hiện (cache có tail làm cursor).
    const viewerJoined = await viewerContext.request.post(`${API}/servers/join`, {
      headers: viewerHeaders,
      data: { inviteCode: server.inviteCode },
    });
    expect(viewerJoined.ok()).toBeTruthy();
    const page = await viewerContext.newPage();
    await page.goto(`/servers/${server.id}/channels/${channelId}`);
    await expect(page.getByText('Chưa có tin nhắn nào. Hãy gửi tin đầu tiên!')).toBeVisible({
      timeout: 15_000,
    });

    // Ngắt mạng thật sự: offline emulation + đóng bridge WebSocket (Chromium giữ WS cũ).
    let offline = false;
    const bridges = new Set<{ close: () => Promise<void> }>();
    await page.routeWebSocket(/\/socket\.io\//, (socket) => {
      if (offline) {
        void socket.close();
        return;
      }
      socket.connectToServer();
      bridges.add(socket);
    });
    async function setOffline(value: boolean) {
      offline = value;
      await page.context().setOffline(value);
      if (value) {
        await Promise.all([...bridges].map((socket) => socket.close().catch(() => {})));
        bridges.clear();
      }
    }

    // Hai tin lúc CÒN online để cache có tail — reconnect mới đi đường vá `?after=`
    // (kênh trống thì tail không có, sẽ rơi về nhánh refetch trang đầu).
    for (const content of [`gap pre-1 ${suffix}`, `gap pre-2 ${suffix}`]) {
      const res = await senderContext.request.post(`${API}/channels/${channelId}/messages`, {
        headers: senders[0]!,
        data: { content, nonce: randomUUID() },
      });
      expect(res.ok()).toBeTruthy();
    }
    await expect(
      page.getByText(`gap pre-2 ${suffix}`, { exact: true }).filter({ visible: true }),
    ).toBeVisible({ timeout: 15_000 });

    await setOffline(true);
    await expect(page.getByText('Mất kết nối. Đang thử kết nối lại…')).toBeVisible({
      timeout: 45_000,
    });

    // 100 tin khi viewer offline (chia đều 3 người gửi), đánh số để kiểm thứ tự.
    const TOTAL = 100;
    const sentIds: string[] = [];
    // Vòng 100 request có thể văng lỗi mạng nhất thời (API watch restart giữa chừng):
    // thử lại TỪNG request tối đa 2 lần — cùng nonce nên an toàn idempotent.
    const postWithRetry = async (i: number) => {
      for (let attempt = 0; ; attempt += 1) {
        try {
          return await senderContext.request.post(`${API}/channels/${channelId}/messages`, {
            headers: senders[i % senders.length]!,
            data: { content: `gap ${String(i).padStart(3, '0')} ${suffix}`, nonce: nonces[i]! },
          });
        } catch (error) {
          if (attempt >= 2) throw error;
          await page.waitForTimeout(1_000);
        }
      }
    };
    const nonces = Array.from({ length: TOTAL }, () => randomUUID());
    for (let i = 0; i < TOTAL; i += 1) {
      const res = await postWithRetry(i);
      expect(res.ok()).toBeTruthy();
      sentIds.push(((await res.json()) as { id: string }).id);
      // 400 ms/lần: mỗi người ~10 tin/12 s, IP ~85 req/phút — dưới hai trần rate limit.
      await page.waitForTimeout(400);
    }
    // Xóa 1 tin lúc offline (không phải tin đầu/cuối) — sau reconnect phải biến mất.
    const deletedIndex = 50;
    const deleted = await senderContext.request.delete(`${API}/messages/${sentIds[deletedIndex]}`, {
      headers: senders[0]!,
    });
    expect(deleted.ok()).toBeTruthy();

    await setOffline(false);

    // Danh sách ảo hóa chỉ render hàng trong viewport nên kiểm theo mẫu: cuộn dần từ đáy
    // lên, mỗi mẫu phải xuất hiện đúng một lần; hàng cuối (mới nhất) phải tự hiện vì
    // followOnAppend giữ viewer ở đáy. Thứ tự đầy đủ đã được patchGap unit test chứng minh.
    const scroller = page.getByLabel(`Tin nhắn trong #general`);
    const textOf = (i: number) => `gap ${String(i).padStart(3, '0')} ${suffix}`;

    // Hàng cuối cùng hiện trong viewport đáy, đúng một bản.
    await expect(page.getByText(textOf(99), { exact: true }).filter({ visible: true })).toHaveCount(
      1,
      { timeout: 60_000 },
    );
    await expect(page.getByText('Mất kết nối. Đang thử kết nối lại…')).toHaveCount(0, {
      timeout: 45_000,
    });

    async function scrollToFind(text: string): Promise<boolean> {
      const height = await scroller.evaluate((el: HTMLElement) => el.scrollHeight);
      for (let top = height; top >= 0; top -= 300) {
        await scroller.evaluate((el: HTMLElement, value: number) => {
          el.scrollTop = value;
        }, top);
        await page.waitForTimeout(200);
        const found = await page.getByText(text, { exact: true }).filter({ visible: true }).count();
        if (found === 1) return true;
        if (found > 1) throw new Error(`Trùng nội dung: ${text} xuất hiện ${found} lần`);
      }
      return false;
    }

    for (const sample of [0, 10, 30, 70, 98]) {
      expect(await scrollToFind(textOf(sample))).toBe(true);
    }
    // Tin bị xóa lúc offline: cuộn qua vùng của nó mà không thấy.
    expect(await scrollToFind(textOf(deletedIndex))).toBe(false);

    // Server do alice (senders[0]) tạo — chỉ chủ mới xóa được.
    const cleanup = await senderContext.request.delete(`${API}/servers/${server.id}`, {
      headers: senders[0]!,
    });
    expect(cleanup.ok()).toBeTruthy();
  } finally {
    await viewerContext.close();
    await senderContext.close();
  }
});
