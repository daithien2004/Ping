import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { type ServerDetail } from '@ping/shared';
import { pacedLogin } from './login-pace';

const API = 'http://localhost:4000/api/v1';

/**
 * TG.1: reply qua UI — chọn "Trả lời" từ menu tin, thanh reply trong composer, khối trích dẫn
 * ở tin trả lời, bấm để nhảy tới tin gốc, hủy reply, và tin gốc bị xóa hiển thị "đã bị xóa".
 */
test('reply: composer bar, quote block, jump to original, cancel, deleted original', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const ownerContext = await browser.newContext();
  try {
    const auth = await pacedLogin(ownerContext.request, 'alice@ping.dev', 'password123');
    const headers = { Authorization: `Bearer ${auth.accessToken}` };

    const suffix = randomUUID().slice(0, 8);
    const server = (await (
      await ownerContext.request.post(`${API}/servers`, {
        headers,
        data: { name: `Reply ${suffix}` },
      })
    ).json()) as ServerDetail;
    const channelId = server.channels[0]!.id;

    const page = await ownerContext.newPage();
    await page.goto(`/servers/${server.id}/channels/${channelId}`);
    const composer = page.getByTestId('message-composer');
    await expect(composer).toBeVisible({ timeout: 45_000 });

    const articles = page.locator('article');
    const send = async (content: string) => {
      const before = await articles.count();
      await composer.fill(content);
      await composer.press('Enter');
      await expect(articles).toHaveCount(before + 1, { timeout: 20_000 });
    };

    await send('tin gốc để trả lời');
    // Chờ server xác nhận (id thật thay cho `temp-<nonce>` của tin optimistic).
    await expect
      .poll(async () => articles.last().getAttribute('data-message-id'))
      .not.toMatch(/^temp-/);
    const originalId = await articles.last().getAttribute('data-message-id');
    expect(originalId).toBeTruthy();

    await test.step('chọn Trả lời → thanh reply hiện đúng tác giả + trích đoạn', async () => {
      await articles.last().getByRole('button', { name: 'Thao tác tin nhắn' }).click();
      await page.getByRole('menuitem', { name: 'Trả lời' }).click();
      const bar = page.getByTestId('reply-bar');
      await expect(bar).toBeVisible();
      await expect(bar).toContainText('Đang trả lời');
      await expect(bar).toContainText('tin gốc để trả lời');
    });

    await test.step('gửi reply → khối trích dẫn nằm trong tin mới', async () => {
      await send('đây là trả lời');
      const reply = articles.last();
      const preview = reply.getByTestId('reply-preview');
      await expect(preview).toBeVisible();
      await expect(preview).toContainText('tin gốc để trả lời');
      // Server trả preview thật (không chỉ optimistic): tải lại vẫn còn khối trích dẫn.
      await page.reload();
      await expect(articles.last().getByTestId('reply-preview')).toContainText(
        'tin gốc để trả lời',
        { timeout: 45_000 },
      );
    });

    await test.step('bấm khối trích dẫn → nhảy tới và tô sáng tin gốc', async () => {
      await articles.last().getByTestId('reply-preview').click();
      const original = page.locator(`article[data-message-id="${originalId}"]`);
      await expect(original).toBeVisible();
      await expect(original).toHaveClass(/ring-1/);
    });

    await test.step('hủy reply → thanh reply biến mất', async () => {
      await articles.last().getByRole('button', { name: 'Thao tác tin nhắn' }).click();
      await page.getByRole('menuitem', { name: 'Trả lời' }).click();
      await expect(page.getByTestId('reply-bar')).toBeVisible();
      await page.getByRole('button', { name: 'Hủy trả lời' }).click();
      await expect(page.getByTestId('reply-bar')).toHaveCount(0);
    });

    await test.step('tin gốc bị xóa → khối trích dẫn hiện "Tin nhắn đã bị xóa"', async () => {
      const removed = await ownerContext.request.delete(`${API}/messages/${originalId}`, {
        headers,
      });
      expect(removed.ok()).toBeTruthy();
      await page.reload();
      await expect(articles.last().getByTestId('reply-preview')).toContainText(
        'Tin nhắn đã bị xóa',
        { timeout: 45_000 },
      );
    });

    const cleanup = await ownerContext.request.delete(`${API}/servers/${server.id}`, {
      headers,
    });
    expect(cleanup.ok()).toBeTruthy();
  } finally {
    await ownerContext.close();
  }
});
