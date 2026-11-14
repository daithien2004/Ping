import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { type ServerDetail } from '@ping/shared';
import { pacedLogin } from './login-pace';

const API = 'http://localhost:4000/api/v1';
const SEED_PASSWORD = 'password123';

test('chaos: dropped and reordered message.created frames - no duplicates, order holds, drop is healed', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const viewerContext = await browser.newContext();
  const senderContext = await browser.newContext();
  try {
    const viewer = await pacedLogin(
      viewerContext.request,
      process.env.E2E_EMAIL!,
      process.env.E2E_PASSWORD!,
    );
    const viewerHeaders = { Authorization: `Bearer ${viewer.accessToken}` };
    const alice = await pacedLogin(senderContext.request, 'alice@ping.dev', SEED_PASSWORD);
    const aliceHeaders = { Authorization: `Bearer ${alice.accessToken}` };

    const suffix = randomUUID().slice(0, 8);
    const server = (await (
      await senderContext.request.post(`${API}/servers`, {
        headers: aliceHeaders,
        data: { name: `Chaos ${suffix}` },
      })
    ).json()) as ServerDetail;
    const channelId = server.channels[0]!.id;
    const viewerJoined = await viewerContext.request.post(`${API}/servers/join`, {
      headers: viewerHeaders,
      data: { inviteCode: server.inviteCode },
    });
    expect(viewerJoined.ok()).toBeTruthy();

    const page = await viewerContext.newPage();
    let held: string | null = null;
    await page.routeWebSocket(/\/socket\.io\//, (ws) => {
      const serverSide = ws.connectToServer();
      ws.onMessage((message) => serverSide.send(message));
      serverSide.onMessage((message) => {
        const frame = typeof message === 'string' ? message : message.toString('utf8');
        if (!frame.includes('message.created') || !frame.includes(suffix)) {
          ws.send(message);
          return;
        }
        if (frame.includes('chaos-drop')) {
          return;
        }
        if (frame.includes('chaos-hold')) {
          held = frame;
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

    await page.goto(`/channels/${server.id}/${channelId}`);
    await expect(page.getByText('Chưa có tin nhắn nào. Hãy gửi tin đầu tiên!')).toBeVisible({
      timeout: 15_000,
    });

    const send = (content: string) =>
      senderContext.request.post(`${API}/channels/${channelId}/messages`, {
        headers: aliceHeaders,
        data: { content, nonce: randomUUID() },
      });

    const keep1 = `chaos-keep1 ${suffix}`;
    const drop = `chaos-drop ${suffix}`;
    const hold = `chaos-hold ${suffix}`;
    const keep4 = `chaos-keep4 ${suffix}`;
    for (const content of [keep1, drop, hold, keep4]) {
      expect((await send(content)).ok()).toBeTruthy();
    }

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

    await page.context().setOffline(true);
    await expect(page.getByText('Mất kết nối. Đang thử kết nối lại…')).toBeVisible({
      timeout: 45_000,
    });
    await page.context().setOffline(false);
    await expect(row(drop)).toHaveCount(1, { timeout: 45_000 });
    await expect(page.getByText('Mất kết nối. Đang thử kết nối lại…')).toHaveCount(0, {
      timeout: 45_000,
    });
    for (const text of [keep1, drop, hold, keep4]) {
      await expect(row(text)).toHaveCount(1);
    }

    const cleanup = await senderContext.request.delete(`${API}/servers/${server.id}`, {
      headers: aliceHeaders,
    });
    expect(cleanup.ok()).toBeTruthy();
  } finally {
    await viewerContext.close();
    await senderContext.close();
  }
});
