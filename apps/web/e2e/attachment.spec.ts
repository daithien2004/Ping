import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import type { ServerDetail } from '@ping/shared';
import { pacedLogin } from './login-pace';

const API = 'http://localhost:4000/api/v1';
// PNG fixture is generated locally; no external assets or user data.
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

test('attachments: select, cancel, reject fake file, send image, preview, realtime and accessibility', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const owner = await browser.newContext();
  const other = await browser.newContext();
  let serverId = '';
  let headers: Record<string, string> = {};
  try {
    const login = await pacedLogin(owner.request, 'alice@ping.dev', 'password123');
    headers = { Authorization: `Bearer ${login.accessToken}` };
    const created = await owner.request.post(`${API}/servers`, {
      headers,
      data: { name: `Upload ${randomUUID().slice(0, 8)}` },
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
    await page.goto(`/servers/${server.id}/channels/${channelId}`);
    await second.goto(`/servers/${server.id}/channels/${channelId}`);
    await expect(page.getByTestId('message-composer')).toBeVisible({ timeout: 45_000 });
    await expect(second.getByTestId('message-composer')).toBeVisible({ timeout: 45_000 });
    await page.getByTestId('attachment-input').setInputFiles({
      name: 'unsafe.png',
      mimeType: 'image/png',
      buffer: Buffer.from('<svg onload="alert(1)"/>'),
    });
    await expect(page.getByTestId('upload-draft')).toContainText('Tệp không được hỗ trợ', {
      timeout: 60_000,
    });
    await page.getByRole('button', { name: 'Gỡ unsafe.png' }).click();
    await page
      .getByTestId('attachment-input')
      .setInputFiles({ name: 'cancel.png', mimeType: 'image/png', buffer: png });
    await page.getByRole('button', { name: 'Gỡ cancel.png' }).click();
    await expect(page.getByTestId('upload-draft')).toHaveCount(0);
    await page
      .getByTestId('attachment-input')
      .setInputFiles({ name: 'demo.png', mimeType: 'image/png', buffer: png });
    await expect(page.getByTestId('upload-draft')).toContainText('Sẵn sàng gửi', {
      timeout: 60_000,
    });
    await page.getByTestId('message-composer').press('Enter');
    await expect(page.getByTestId('attachment')).toHaveCount(1, { timeout: 15_000 });
    await expect(second.getByTestId('attachment')).toHaveCount(1, { timeout: 15_000 });
    const image = page.getByTestId('attachment').getByRole('img');
    await expect(image).toBeVisible();
    await expect
      .poll(() => image.evaluate((node) => (node as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Xem trước demo.png' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    for (const theme of ['dark', 'light']) {
      await page.evaluate(
        (value) => document.documentElement.classList.toggle('dark', value === 'dark'),
        theme,
      );
      expect(
        (await new AxeBuilder({ page }).include('[role="dialog"]').analyze()).violations,
      ).toEqual([]);
    }
    await page.screenshot({
      path: resolve(__dirname, '../../../docs/v0.2.0/evidence/TG.6/lightbox.png'),
    });
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.reload();
    await expect(page.getByTestId('attachment')).toHaveCount(1, { timeout: 30_000 });
  } finally {
    if (serverId) await owner.request.delete(`${API}/servers/${serverId}`, { headers });
    await owner.close();
    await other.close();
  }
});
