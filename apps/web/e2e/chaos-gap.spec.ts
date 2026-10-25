import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { type AuthResponse, type ServerDetail } from '@ping/shared';

const API = 'http://localhost:4000/api/v1';
const SEED_PASSWORD = 'password123';

/**
 * T4.5 (hỗn loạn nhẹ): chặn frame WebSocket `message.created` phía server→page để
 * (1) RỚT GÓI một frame, (2) ĐẢO THỨ TỰ (giữ một frame lại rồi thả sau tin kế tiếp).
 * Hiển thị không trùng, thứ tự đúng theo id (insert-sorted); sau reconnect, tin bị rớt
 * được vá lại bằng merge trang-mới-nhất của useChannelSync.
 */
test('chaos: dropped and reordered message.created frames - no duplicates, order holds, drop is healed', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const viewerContext = await browser.newContext();
  const senderContext = await browser.newContext();
  try {
    const login = async (context: typeof viewerContext, email: string, password: string) => {
      const response = await context.request.post(`${API}/auth/login`, {
        data: { email, password },
      });
      expect(response.ok()).toBeTruthy();
      const auth = (await response.json()) as AuthResponse;
      return { auth, headers: { Authorization: `Bearer ${auth.accessToken}` } };
    };

    const viewer = await login(viewerContext, process.env.E2E_EMAIL!, process.env.E2E_PASSWORD!);
    const alice = await login(senderContext, 'alice@ping.dev', SEED_PASSWORD);

    const suffix = randomUUID().slice(0, 8);
    const server = (await (
      await senderContext.request.post(`${API}/servers`, {
        headers: alice.headers,
        data: { name: `Chaos ${suffix}` },
      })
    ).json()) as ServerDetail;
    const channelId = server.channels[0]!.id;
    const viewerJoined = await viewerContext.request.post(`${API}/servers/join`, {
      headers: viewer.headers,
      data: { inviteCode: server.inviteCode },
    });
    expect(viewerJoined.ok()).toBeTruthy();

    const page = await viewerContext.newPage();
    // Proxy WS: mọi frame được chuyển tiếp trừ frame bị đánh dấu drop/hold.
    let held: string | null = null;
    await page.routeWebSocket(/\/socket\.io\//, (ws) => {
      const serverSide = ws.connectToServer();
      ws.onMessage((message) => serverSide.send(message));
      serverSide.onMessage((message) => {
        const frame = typeof message === 'string' ? message : message.toString('utf8');
        // Chỉ đụng frame event message.created chứa token của test; ping/pong và event
        // khác chuyển tiếp nguyên dạng.
        if (!frame.includes('message.created') || !frame.includes(suffix)) {
          ws.send(message);
          return;
        }
        if (frame.includes('chaos-drop')) {
          return; // rớt gói: không chuyển tiếp.
        }
        if (frame.includes('chaos-hold')) {
          held = frame; // đảo thứ tự: giữ lại, thả sau tin kế tiếp.
          return;
        }
        ws.send(message);
        if (held !== null) {
          const release = held;
          held = null;
          ws.send(release);
        }
      });
    });

    await page.goto(`/servers/${server.id}/channels/${channelId}`);
    await expect(page.getByText('Chưa có tin nhắn nào. Hãy gửi tin đầu tiên!')).toBeVisible({
      timeout: 15_000,
    });

    const send = (content: string) =>
      senderContext.request.post(`${API}/channels/${channelId}/messages`, {
        headers: alice.headers,
        data: { content, nonce: randomUUID() },
      });

    // m1 giữ nguyên, m2 RỚT, m3 GIỮ LẠI, m4 chuyển tiếp bình thường rồi m3 mới được thả.
    const keep1 = `chaos-keep1 ${suffix}`;
    const drop = `chaos-drop ${suffix}`;
    const hold = `chaos-hold ${suffix}`;
    const keep4 = `chaos-keep4 ${suffix}`;
    for (const content of [keep1, drop, hold, keep4]) {
      expect((await send(content)).ok()).toBeTruthy();
    }

    // Sau cơn hỗn loạn: không trùng; m3 (giữa) phải nằm DƯỚI m1 và TRÊN m4 — đúng thứ tự id
    // dù event m3 đến sau m4 (insert-sorted). m2 chưa xuất hiện (bị rớt).
    const row = (text: string) => page.getByText(text, { exact: true }).filter({ visible: true });
    await expect(row(keep1)).toHaveCount(1, { timeout: 20_000 });
    await expect(row(hold)).toHaveCount(1);
    await expect(row(keep4)).toHaveCount(1);
    const y1 = await row(keep1).boundingBox();
    const y3 = await row(hold).boundingBox();
    const y4 = await row(keep4).boundingBox();
    expect(y1 && y3 && y4).toBeTruthy();
    expect(y1!.y).toBeLessThan(y3!.y);
    expect(y3!.y).toBeLessThan(y4!.y);
    await expect(row(drop)).toHaveCount(0);

    // Reconnect: useChannelSync vá lại m2 bằng merge trang-mới-nhất (tail đã vượt qua m2).
    await page.context().setOffline(true);
    await expect(page.getByText('Mất kết nối. Đang thử kết nối lại…')).toBeVisible({
      timeout: 45_000,
    });
    await page.context().setOffline(false);
    await expect(row(drop)).toHaveCount(1, { timeout: 45_000 });
    await expect(page.getByText('Mất kết nối. Đang thử kết nối lại…')).toHaveCount(0, {
      timeout: 45_000,
    });
    // Không tin nào bị hiển thị trùng sau khi vá.
    for (const text of [keep1, drop, hold, keep4]) {
      await expect(row(text)).toHaveCount(1);
    }

    const cleanup = await senderContext.request.delete(`${API}/servers/${server.id}`, {
      headers: alice.headers,
    });
    expect(cleanup.ok()).toBeTruthy();
  } finally {
    await viewerContext.close();
    await senderContext.close();
  }
});
