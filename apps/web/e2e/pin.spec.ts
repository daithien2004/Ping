import { randomUUID } from 'node:crypto';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { MessageDto, ServerDetail } from '@ping/shared';
import { pacedLogin } from './login-pace';

const API = 'http://localhost:4000/api/v1';

/**
 * TG.3 (ADR-0066): ghim tin qua UI — menu Ghim/Bỏ ghim, chỉ báo trên tin, panel danh sách ghim,
 * realtime giữa hai người (bob là moderator có MANAGE_MESSAGES trong seed) và axe cho panel.
 */
test('pins: pin from menu, panel, realtime and unpin', async ({ browser }) => {
  test.setTimeout(240_000);
  const ownerContext = await browser.newContext();
  const otherContext = await browser.newContext();
  try {
    const auth = await pacedLogin(ownerContext.request, 'alice@ping.dev', 'password123');
    const headers = { Authorization: `Bearer ${auth.accessToken}` };
    const suffix = randomUUID().slice(0, 8);
    const server = (await (
      await ownerContext.request.post(`${API}/servers`, {
        headers,
        data: { name: `Pins ${suffix}` },
      })
    ).json()) as ServerDetail;
    const channelId = server.channels[0]!.id;

    const created = await ownerContext.request.post(`${API}/channels/${channelId}/messages`, {
      headers,
      data: { content: 'tin sẽ được ghim', nonce: randomUUID() },
    });
    expect(created.ok()).toBeTruthy();
    const message = (await created.json()) as MessageDto;

    const bob = await pacedLogin(otherContext.request, 'bob@ping.dev', 'password123');
    const bobHeaders = { Authorization: `Bearer ${bob.accessToken}` };
    const joined = await otherContext.request.post(`${API}/servers/join`, {
      headers: bobHeaders,
      data: { inviteCode: server.inviteCode },
    });
    expect(joined.ok()).toBeTruthy();

    const page = await ownerContext.newPage();
    await page.goto(`/servers/${server.id}/channels/${channelId}`);
    const article = page.locator(`article[data-message-id="${message.id}"]`);
    await expect(article).toBeVisible({ timeout: 45_000 });

    const bobPage = await otherContext.newPage();
    await bobPage.goto(`/servers/${server.id}/channels/${channelId}`);
    const bobArticle = bobPage.locator(`article[data-message-id="${message.id}"]`);
    await expect(bobArticle).toBeVisible({ timeout: 45_000 });

    // Chờ socket của bob vào room channel trước khi kiểm realtime: `message.created` chỉ tới
    // room đã join, nên tin đánh dấu hiện ở tab bob là bằng chứng join xong.
    const warmup = await ownerContext.request.post(`${API}/channels/${channelId}/messages`, {
      headers,
      data: { content: `warmup ${suffix}`, nonce: randomUUID() },
    });
    expect(warmup.ok()).toBeTruthy();
    const warmupMessage = (await warmup.json()) as MessageDto;
    await expect(bobPage.locator(`article[data-message-id="${warmupMessage.id}"]`)).toBeVisible({
      timeout: 45_000,
    });

    await test.step('menu tin nhắn → Ghim, chỉ báo hiện ngay', async () => {
      await article.getByRole('button', { name: 'Thao tác' }).click();
      await page.getByTestId('pin').click();
      await expect(article.getByTestId('pin-indicator')).toBeVisible({ timeout: 15_000 });
      // Realtime: tab của bob thấy tin được ghim mà không cần tải lại.
      await expect(bobArticle.getByTestId('pin-indicator')).toBeVisible({ timeout: 15_000 });
    });

    await test.step('panel danh sách ghim hiện tin, đủ trạng thái và axe sạch', async () => {
      await page.getByTestId('pins-toggle').click();
      const panel = page.getByTestId('pinned-panel');
      await expect(panel).toBeVisible();
      await expect(panel.getByTestId('pinned-item')).toHaveCount(1);
      await expect(panel).toContainText('tin sẽ được ghim');
      for (const colorScheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme });
        await page.waitForFunction(() =>
          document
            .getAnimations()
            .every((animation) => animation.effect?.getComputedTiming().iterations === Infinity),
        );
        const { violations } = await new AxeBuilder({ page })
          .include('[data-testid="pinned-panel"]')
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze();
        expect(violations).toEqual([]);
      }
    });

    await test.step('bỏ ghim trong panel → cả hai tab cập nhật', async () => {
      // Bỏ ghim bằng chủ server (bob chỉ là thành viên thường ở server mới, không có
      // MANAGE_MESSAGES); realtime của bob đã được kiểm ở bước ghim phía trên.
      await page.getByTestId('pinned-panel').getByRole('button', { name: 'Bỏ ghim' }).click();
      await expect(article.getByTestId('pin-indicator')).toHaveCount(0, { timeout: 15_000 });
      await expect(bobArticle.getByTestId('pin-indicator')).toHaveCount(0, { timeout: 15_000 });
      await expect(page.getByTestId('pinned-panel')).not.toContainText('tin sẽ được ghim');
    });

    const cleanup = await ownerContext.request.delete(`${API}/servers/${server.id}`, {
      headers,
    });
    expect(cleanup.ok()).toBeTruthy();
  } finally {
    await ownerContext.close();
    await otherContext.close();
  }
});
