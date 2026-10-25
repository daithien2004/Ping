import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { type AuthResponse, type ServerDetail } from '@ping/shared';

const API = 'http://localhost:4000/api/v1';

/**
 * TG.4 (ADR-0054): markdown tập con qua UI — định dạng hiển thị đúng; payload XSS chỉ còn
 * văn bản thuần (không element nguy hiểm); mention thành chip; spoiler bấm để lộ.
 */
test('markdown: formatting renders, XSS payloads are inert, mention chip, spoiler reveals', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const ownerContext = await browser.newContext();
  try {
    const login = await ownerContext.request.post(`${API}/auth/login`, {
      data: { email: 'alice@ping.dev', password: 'password123' },
    });
    expect(login.ok()).toBeTruthy();
    const auth = (await login.json()) as AuthResponse;
    const headers = { Authorization: `Bearer ${auth.accessToken}` };

    const suffix = randomUUID().slice(0, 8);
    const server = (await (
      await ownerContext.request.post(`${API}/servers`, {
        headers,
        data: { name: `Md ${suffix}` },
      })
    ).json()) as ServerDetail;
    const channelId = server.channels[0]!.id;

    const page = await ownerContext.newPage();
    await page.goto(`/servers/${server.id}/channels/${channelId}`);
    const composer = page.getByTestId('message-composer');
    await expect(composer).toBeVisible({ timeout: 45_000 });

    const send = async (content: string) => {
      const before = await page.locator('article').count();
      await composer.fill(content);
      await composer.press('Enter');
      // Chờ tin mới thực sự vào danh sách (optimistic render ngay, cả khi sending).
      await expect(page.locator('article')).toHaveCount(before + 1, { timeout: 20_000 });
    };

    await test.step('định dạng hiển thị đúng', async () => {
      await send(`**quan trọng** và *nhẹ* và \`code\` và ||bí mật|| và :fire: và @bob nhé`);
      await expect(page.locator('article').last()).toContainText('quan trọng', {
        timeout: 20_000,
      });
      await expect(page.locator('article').last().locator('strong')).toHaveText('quan trọng');
      await expect(page.locator('article').last().locator('em')).toHaveText('nhẹ');
      await expect(page.getByText('code', { exact: true })).toBeVisible();
      await expect(page.getByText('🔥')).toBeVisible();
      await expect(page.getByTestId('mention-chip').first()).toContainText('@bob');
      // Spoiler bấm để lộ.
      const spoiler = page.getByRole('button', { name: 'Nội dung bị che, bấm để xem' }).first();
      await expect(spoiler).toBeVisible();
      await spoiler.click();
      await expect(page.getByText('bí mật', { exact: true })).toBeVisible();
    });

    await test.step('link https thành <a> an toàn; code block hiển thị monospace', async () => {
      await send(
        `xem https://example.com/docs?x=1\n\`\`\`\ncode <script>alert(1)</script>\n\`\`\``,
      );
      const link = page.getByRole('link', { name: 'https://example.com/docs?x=1' }).first();
      await expect(link).toBeVisible();
      expect(await link.getAttribute('rel')).toBe('noopener noreferrer nofollow');
      expect(await link.getAttribute('target')).toBe('_blank');
      await expect(page.getByLabel('code').first()).toContainText('<script>');
    });

    await test.step('payload XSS chỉ là văn bản thuần', async () => {
      const payload = `<script>alert(1)</script> [x](javascript:alert(1)) <img src=x onerror=alert(1)>`;
      await send(payload);
      // Payload hiện NGUYÊN VĂN như chữ trong tin (không thẻ nào được tạo từ nó).
      await expect(
        page.locator('article').filter({ hasText: '[x](javascript:alert(1))' }),
      ).toHaveCount(1);
      // Trong tin payload không được sinh ra link nào (toàn bộ là text thuần).
      const payloadArticle = page.locator('article').filter({
        hasText: '[x](javascript:alert(1))',
      });
      expect(await payloadArticle.locator('a').count()).toBe(0);
      // Payload article không sinh phần tử nào (script/iframe/img) — mọi thứ là text.
      expect(await payloadArticle.locator('script, iframe, img').count()).toBe(0);
    });

    const cleanup = await ownerContext.request.delete(`${API}/servers/${server.id}`, {
      headers,
    });
    expect(cleanup.ok()).toBeTruthy();
  } finally {
    await ownerContext.close();
  }
});
