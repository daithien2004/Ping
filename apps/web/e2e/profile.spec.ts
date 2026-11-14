import { test, expect } from '@playwright/test';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import type { ServerDetail } from '@ping/shared';
import type { AuthResponse } from '@ping/shared';
import { ensureUserVerified } from './global-setup';
import { pacedLogin } from './login-pace';
import { openServerSettings } from './open-server-settings';

const API = 'http://localhost:4000/api/v1';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAACgAAAAeCAIAAADRv8uKAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAN0lEQVRIie3VwQkAQAgDwe2/6VwZ3mPAvyAx0+pksjinnnDlnVIgU5lBIiyGxbA4LIbFsLivWHw+nauNqku18gAAAABJRU5ErkJggg==',
  'base64',
);
let worker: ChildProcess;
test.beforeAll(() => {
  worker = spawn(process.execPath, ['dist/worker.js'], {
    cwd: resolve(__dirname, '../../api'),
    env: { ...process.env, NODE_ENV: 'development', METRICS_PORT: '' },
    windowsHide: true,
    stdio: 'ignore',
  });
});
test.afterAll(() => {
  worker?.kill('SIGTERM');
});

test('profile: avatar and display name update everywhere without reload, nickname and server icon', async ({
  browser,
}) => {
  test.setTimeout(300_000);
  const owner = await browser.newContext();
  const other = await browser.newContext();
  let serverId = '';
  let headers: Record<string, string> = {};
  try {
    // Tài khoản RIÊNG: spec đổi displayName/avatar, không được đụng account seed mà spec khác trông chờ tên gốc.
    const suffix = randomUUID().slice(0, 8);
    const registered = await owner.request.post(`${API}/auth/register`, {
      data: {
        email: `profile-e2e-${suffix}@ping.dev`,
        username: `pe${suffix}`,
        password: 'password123',
      },
    });
    expect(registered.ok()).toBeTruthy();
    const login = (await registered.json()) as AuthResponse;
    headers = { Authorization: `Bearer ${login.accessToken}` };
    await ensureUserVerified(`profile-e2e-${suffix}@ping.dev`);
    const created = await owner.request.post(`${API}/servers`, {
      headers,
      data: { name: `Profile ${suffix}` },
    });
    expect(created.ok()).toBeTruthy();
    const server = (await created.json()) as ServerDetail;
    serverId = server.id;
    const channelId = server.channels[0]!.id;
    const bob = await pacedLogin(other.request, 'bob@ping.dev', 'password123');
    expect(
      (
        await other.request.post(`${API}/servers/join`, {
          headers: { Authorization: `Bearer ${bob.accessToken}` },
          data: { inviteCode: server.inviteCode },
        })
      ).ok(),
    ).toBeTruthy();
    const page = await owner.newPage();
    const second = await other.newPage();
    await page.goto(`/channels/${server.id}/${channelId}`);
    await second.goto(`/channels/${server.id}/${channelId}`);
    await expect(page.getByTestId('message-composer')).toBeVisible({ timeout: 45_000 });
    await expect(second.getByTestId('message-composer')).toBeVisible({ timeout: 45_000 });

    await page.getByTestId('self-avatar').click();
    const selfDialog = page.getByRole('dialog');
    await expect(page.getByTestId('self-profile')).toBeVisible();
    const bindPatch = page.waitForResponse(
      (res) => res.url().includes('/users/me') && res.request().method() === 'PATCH',
    );
    await page
      .getByTestId('avatar-input')
      .setInputFiles({ name: 'avatar.png', mimeType: 'image/png', buffer: png });
    const bindBody = (await (await bindPatch).json()) as { avatarUrl?: string };
    expect(bindBody.avatarUrl).toContain('/api/v1/attachments/');
    await page.getByTestId('display-name-input').fill('Alice Kiêu Hãnh');
    await page.getByRole('button', { name: 'Lưu' }).click();
    await expect(selfDialog).toContainText('Alice Kiêu Hãnh');
    await selfDialog.getByRole('button', { name: 'Đóng' }).click();
    await expect(selfDialog).toHaveCount(0);
    await expect(
      second.getByTestId('member-row').filter({ hasText: 'Alice Kiêu Hãnh' }),
    ).toBeVisible({
      timeout: 30_000,
    });
    await expect(
      second.getByTestId('member-row').filter({ hasText: 'Alice Kiêu Hãnh' }).getByRole('img'),
    ).toBeVisible({ timeout: 30_000 });
    await page.screenshot({
      path: resolve(__dirname, '../../../docs/v0.2.0/evidence/TG.7/avatar-rail.png'),
    });

    await page.getByTestId('member-row').filter({ hasText: 'Alice Kiêu Hãnh' }).click();
    const memberDialog = page.getByRole('dialog');
    await expect(page.getByTestId('member-profile')).toBeVisible();
    await page.getByTestId('nickname-input').fill('Alice Q');
    await memberDialog.getByRole('button', { name: 'Lưu', exact: true }).click();
    await memberDialog.getByRole('button', { name: 'Đóng' }).click();
    await expect(page.getByTestId('member-row').filter({ hasText: 'Alice Q' })).toBeVisible();

    await openServerSettings(page);
    await expect(page.getByTestId('server-icon-input')).toBeAttached({ timeout: 30_000 });
    await page
      .getByTestId('server-icon-input')
      .setInputFiles({ name: 'icon.png', mimeType: 'image/png', buffer: png });
    await expect(page.getByTestId('server-icon-input')).toBeEnabled({ timeout: 60_000 });
    await page.goto(`/channels/${server.id}/${channelId}`);
    await expect(
      page
        .locator('nav')
        .getByRole('link', { name: new RegExp(server.name) })
        .getByRole('img'),
    ).toBeVisible({ timeout: 30_000 });
  } finally {
    if (serverId) await owner.request.delete(`${API}/servers/${serverId}`, { headers });
    await owner.close();
    await other.close();
  }
});
