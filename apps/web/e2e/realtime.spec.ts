import { createHmac, randomUUID } from 'node:crypto';
import { expect, test, type WebSocketRoute } from '@playwright/test';
import type { AuthResponse, ChannelDto, MemberPage, MessageDto, ServerDetail } from '@ping/shared';

const API = 'http://localhost:4000/api/v1';

test('two isolated sessions: messages, typing, missed events, edits, deletes and kick', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  const a = await browser.newContext();
  const b = await browser.newContext();
  let offline = false;
  const sockets = new Set<WebSocketRoute>();
  await b.routeWebSocket(/\/socket\.io\//, (socket) => {
    if (offline) {
      void socket.close();
      return;
    }
    socket.connectToServer();
    sockets.add(socket);
  });
  async function setOffline(value: boolean) {
    offline = value;
    await b.setOffline(value);
    // Chromium offline emulation can leave established WebSockets alive.
    // Close the real server bridges as well so this is a deterministic outage.
    if (value) {
      await Promise.all([...sockets].map((socket) => socket.close().catch(() => {})));
      sockets.clear();
    }
  }
  try {
    const login = await a.request.post(`${API}/auth/login`, {
      data: { email: process.env.E2E_EMAIL, password: process.env.E2E_PASSWORD },
    });
    expect(login.ok()).toBeTruthy();
    const owner = (await login.json()) as AuthResponse;
    const auth = { Authorization: `Bearer ${owner.accessToken}` };
    const suffix = randomUUID().slice(0, 8);
    const registered = await b.request.post(`${API}/auth/register`, {
      data: {
        email: `rt-${suffix}@example.test`,
        username: `rt_${suffix}`,
        password: 'e2e-password',
      },
    });
    expect(registered.ok()).toBeTruthy();
    const member = (await registered.json()) as AuthResponse;
    const memberAuth = { Authorization: `Bearer ${member.accessToken}` };
    const serverId = process.env.E2E_SERVER_ID!;
    const server = (await (
      await a.request.get(`${API}/servers/${serverId}`, { headers: auth })
    ).json()) as ServerDetail;
    expect(
      (
        await b.request.post(`${API}/servers/join`, {
          headers: memberAuth,
          data: { inviteCode: server.inviteCode },
        })
      ).ok(),
    ).toBeTruthy();
    const channel = (await (
      await a.request.post(`${API}/servers/${serverId}/channels`, {
        headers: auth,
        data: { name: `rt-${suffix}` },
      })
    ).json()) as ChannelDto;
    const path = `/servers/${serverId}/channels/${channel.id}`;
    const pa = await a.newPage();
    const pb = await b.newPage();
    let refreshes = 0;
    let rejectRefresh = false;
    await b.route('**/auth/refresh', async (route) => {
      if (rejectRefresh && refreshes >= 1) {
        refreshes++;
        await route.fulfill({
          status: 401,
          json: { code: 'UNAUTHORIZED', message: 'Expired test session', requestId: randomUUID() },
        });
        return;
      }
      const response = await route.fetch();
      const data = (await response.json()) as { accessToken: string };
      refreshes++;
      if (refreshes === 1) {
        const parts = data.accessToken.split('.');
        const payload = JSON.parse(Buffer.from(parts[1]!, 'base64url').toString()) as Record<
          string,
          unknown
        >;
        payload.exp = Math.floor(Date.now() / 1000) + 5;
        const unsigned = `${parts[0]}.${Buffer.from(JSON.stringify(payload)).toString('base64url')}`;
        data.accessToken = `${unsigned}.${createHmac('sha256', process.env.JWT_ACCESS_SECRET!).update(unsigned).digest('base64url')}`;
      }
      await route.fulfill({ response, json: data });
    });
    await pa.goto(path);
    await pb.goto(path);
    const composerA = pa.getByRole('textbox', { name: `Nhắn #${channel.name}` });
    const composerB = pb.getByRole('textbox', { name: `Nhắn #${channel.name}` });
    await expect(composerA).toBeVisible();
    await expect(composerB).toBeVisible();

    // Typing also proves both joins have completed, without an arbitrary sleep.
    await expect(async () => {
      await composerA.fill(`typing ${Date.now()}`);
      await expect(pb.getByText('Có người đang gõ…', { exact: true })).toBeVisible({
        timeout: 3500,
      });
    }).toPass();
    await composerA.fill('');
    await expect(pb.getByText('Có người đang gõ…', { exact: true })).toHaveCount(0);
    await expect.poll(() => refreshes).toBeGreaterThanOrEqual(2);
    await expect(composerB).toBeVisible();

    const content = `realtime ${suffix}`;
    await composerA.fill(content);
    await composerA.press('Enter');
    await expect(pb.locator('article:visible', { hasText: content })).toHaveCount(1);
    await expect(pa.locator('article:visible', { hasText: content })).toHaveCount(1);

    // Trình đọc màn hình: tin của người khác được đọc qua vùng aria-live, tin của chính mình thì không.
    await expect(pb.locator('[aria-live="polite"]').filter({ hasText: content })).toHaveCount(1);
    await expect(pa.locator('[aria-live="polite"]').filter({ hasText: content })).toHaveCount(0);

    const retryContent = `retry ${suffix}`;
    let nonce = '';
    await pa.route('**/channels/*/messages', async (route) => {
      if (route.request().method() !== 'POST') return route.continue();
      nonce = (route.request().postDataJSON() as { nonce: string }).nonce;
      await route.abort('connectionreset');
    });
    await composerA.fill(retryContent);
    await composerA.press('Enter');
    await expect(pa.getByText('Gửi thất bại', { exact: false })).toBeVisible();
    await pa.unrouteAll();
    const retried = pa.waitForRequest(
      (request) => request.method() === 'POST' && request.url().endsWith('/messages'),
    );
    await pa.getByRole('button', { name: 'Thử lại', exact: true }).click();
    expect(((await retried).postDataJSON() as { nonce: string }).nonce).toBe(nonce);
    await expect(pb.getByText(retryContent, { exact: true })).toBeVisible();

    const messages = (await (
      await a.request.get(`${API}/channels/${channel.id}/messages`, { headers: auth })
    ).json()) as { messages: MessageDto[] };
    const id = messages.messages.find((m) => m.content === content)!.id;
    expect(
      (
        await a.request.patch(`${API}/messages/${id}`, {
          headers: auth,
          data: { content: `edited ${suffix}` },
        })
      ).ok(),
    ).toBeTruthy();
    await expect(pb.getByText(`edited ${suffix}`, { exact: true })).toBeVisible();
    expect((await a.request.delete(`${API}/messages/${id}`, { headers: auth })).ok()).toBeTruthy();
    await expect(pb.getByText(`edited ${suffix}`, { exact: true })).toHaveCount(0);

    // Changing channel leaves the old room; reactivation catches up from REST.
    await composerB.fill('saved draft');
    await pb.getByRole('link', { name: '# general', exact: true }).click();
    await expect(pb.getByRole('textbox', { name: 'Nhắn #general' })).toBeVisible();
    const hidden = `while hidden ${suffix}`;
    expect(
      (
        await a.request.post(`${API}/channels/${channel.id}/messages`, {
          headers: auth,
          data: { content: hidden, nonce: randomUUID() },
        })
      ).ok(),
    ).toBeTruthy();
    await pb.getByRole('link', { name: `# ${channel.name}`, exact: true }).click();
    await expect(composerB).toHaveValue('saved draft');
    await expect(pb.getByText(hidden, { exact: true }).filter({ visible: true })).toBeVisible();

    // Offline also exercises Socket.IO's transport failure and automatic reconnection.
    await setOffline(true);
    await expect(pb.getByText('Mất kết nối. Đang thử kết nối lại…', { exact: true })).toBeVisible({
      timeout: 45000,
    });
    const missed = `missed ${suffix}`;
    expect(
      (
        await a.request.post(`${API}/channels/${channel.id}/messages`, {
          headers: auth,
          data: { content: missed, nonce: randomUUID() },
        })
      ).ok(),
    ).toBeTruthy();
    await setOffline(false);
    await expect(pb.getByText(missed, { exact: true }).filter({ visible: true })).toBeVisible({
      timeout: 20000,
    });
    await expect(pb.getByText('Mất kết nối. Đang thử kết nối lại…', { exact: true })).toHaveCount(
      0,
    );

    const defaultRole = server.roles.find((role) => role.isDefault)!;
    expect(
      (
        await a.request.patch(`${API}/roles/${defaultRole.id}`, {
          headers: auth,
          data: { permissions: '0' },
        })
      ).ok(),
    ).toBeTruthy();
    await expect(pb.getByText('Bạn không có quyền làm việc này.', { exact: true })).toBeVisible();
    await expect(pb.getByText(missed, { exact: true }).filter({ visible: true })).toHaveCount(0);
    expect(
      (
        await a.request.patch(`${API}/roles/${defaultRole.id}`, {
          headers: auth,
          data: { permissions: defaultRole.permissions },
        })
      ).ok(),
    ).toBeTruthy();
    await expect(composerB).toBeVisible();

    const members = (await (
      await a.request.get(`${API}/servers/${serverId}/members`, { headers: auth })
    ).json()) as MemberPage;
    const memberId = members.members.find((m) => m.userId === member.user.id)!.id;
    expect(
      (
        await a.request.delete(`${API}/servers/${serverId}/members/${memberId}`, { headers: auth })
      ).status(),
    ).toBe(204);
    await expect(pb.getByRole('textbox', { name: `Nhắn #${channel.name}` })).toHaveCount(0);
    await expect(pb.getByText(missed, { exact: true })).toHaveCount(0);
    await expect(pb.getByText(hidden, { exact: true })).toHaveCount(0);

    // A kick while offline has no delivered personal event; reconnect must check REST.
    expect(
      (
        await b.request.post(`${API}/servers/join`, {
          headers: memberAuth,
          data: { inviteCode: server.inviteCode },
        })
      ).ok(),
    ).toBeTruthy();
    await pb.goto(path);
    await expect(composerB).toBeVisible();
    await setOffline(true);
    await expect(pb.getByText('Mất kết nối. Đang thử kết nối lại…', { exact: true })).toBeVisible({
      timeout: 45000,
    });
    const rejoined = (await (
      await a.request.get(`${API}/servers/${serverId}/members`, { headers: auth })
    ).json()) as MemberPage;
    const rejoinedId = rejoined.members.find((m) => m.userId === member.user.id)!.id;
    expect(
      (
        await a.request.delete(`${API}/servers/${serverId}/members/${rejoinedId}`, {
          headers: auth,
        })
      ).status(),
    ).toBe(204);
    await setOffline(false);
    await expect(pb.getByRole('textbox', { name: `Nhắn #${channel.name}` })).toHaveCount(0);
    await expect(pb.getByText(missed, { exact: true })).toHaveCount(0);

    // Rejected refresh clears the signed-in UI and sends the user back to login.
    refreshes = 0;
    rejectRefresh = true;
    await pb.reload();
    await expect.poll(() => refreshes, { timeout: 15000 }).toBeGreaterThanOrEqual(2);
    await expect(pb).toHaveURL(/\/login\?next=/);
    await expect(pb.getByText(missed, { exact: true })).toHaveCount(0);
  } finally {
    await a.close();
    await b.close();
  }
});
