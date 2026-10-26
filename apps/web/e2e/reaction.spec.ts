import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import type { MessageDto, ServerDetail } from '@ping/shared';
import { pacedLogin } from './login-pace';

const API = 'http://localhost:4000/api/v1';

/**
 * TG.2 (ADR-0064): cảm xúc qua UI — hộp chọn emoji, viên thuốc tách đôi (emoji = thả/gỡ,
 * số = danh sách người thả), optimistic + response chuẩn, giữ sau reload, và realtime khi
 * người khác thả/gỡ.
 */
test('reactions: pick, toggle, reactor list and realtime from another member', async ({
  browser,
}) => {
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
        data: { name: `Reactions ${suffix}` },
      })
    ).json()) as ServerDetail;
    const channelId = server.channels[0]!.id;

    const created = await ownerContext.request.post(`${API}/channels/${channelId}/messages`, {
      headers,
      data: { content: 'thả cảm xúc vào tin này', nonce: randomUUID() },
    });
    expect(created.ok()).toBeTruthy();
    const message = (await created.json()) as MessageDto;

    // bob là thành viên server (nhận ADD_REACTIONS mặc định của @everyone).
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

    await test.step('chọn 👍 trong hộp chọn → viên thuốc hiện 1 và là của mình', async () => {
      await article.getByTestId('add-reaction').click();
      const picker = page.getByTestId('emoji-picker');
      await expect(picker).toBeVisible();
      await picker.getByTestId('emoji-search').fill('thumbsup');
      await picker.locator('button[title=":thumbsup:"]').click();
      const pill = article.getByTestId('reaction-👍');
      await expect(pill).toBeVisible();
      await expect(pill).toHaveAttribute('data-me', 'true');
      await expect(pill.getByRole('button').nth(1)).toHaveText('1');
      await expect(bobArticle.getByTestId('reaction-👍').getByRole('button').nth(1)).toHaveText(
        '1',
      );
      await expect(bobArticle.getByTestId('reaction-👍')).not.toHaveAttribute('data-me', 'true');
    });

    await test.step('reaction controls pass axe in light and dark themes', async () => {
      for (const colorScheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme });
        await page.waitForFunction(() =>
          document
            .getAnimations()
            .every((animation) => animation.effect?.getComputedTiming().iterations === Infinity),
        );
        const { violations } = await new AxeBuilder({ page })
          .include(`article[data-message-id="${message.id}"]`)
          .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
          .analyze();
        expect(violations).toEqual([]);
        await page.screenshot({
          path: resolve(`../../docs/v0.2.0/evidence/TG.2/screens/reactions-${colorScheme}.png`),
        });
      }
    });

    await test.step('bấm phần số KHÔNG gỡ cảm xúc — mở danh sách người thả', async () => {
      const pill = article.getByTestId('reaction-👍');
      await pill.getByRole('button').nth(1).click();
      const dialog = page.getByRole('dialog');
      await expect(dialog).toContainText('Người đã thả 👍');
      await expect(dialog).toContainText('Alice Nguyen');
      const { violations } = await new AxeBuilder({ page })
        .include('[role="dialog"]')
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      expect(violations).toEqual([]);
      await page.keyboard.press('Escape');
      await expect(pill).toHaveAttribute('data-me', 'true');
    });

    await test.step('người khác thả/gỡ trong tab thứ hai → cập nhật realtime', async () => {
      const bobPill = bobArticle.getByTestId('reaction-👍');
      await bobPill.getByRole('button').nth(0).click();
      const pill = article.getByTestId('reaction-👍');
      await expect(pill.getByRole('button').nth(1)).toHaveText('2', { timeout: 15_000 });
      // Cờ "của mình" không bị event của người khác làm sai.
      await expect(pill).toHaveAttribute('data-me', 'true');

      await expect(bobPill.getByRole('button').nth(0)).toBeEnabled();
      await bobPill.getByRole('button').nth(0).click();
      await expect(pill.getByRole('button').nth(1)).toHaveText('1', { timeout: 15_000 });
    });

    await test.step('a rejected reaction rolls back its optimistic pill', async () => {
      let releaseResponse = () => {};
      const responseGate = new Promise<void>((resolve) => {
        releaseResponse = resolve;
      });
      await page.route(`**/messages/${message.id}/reactions/**`, async (route) => {
        if (route.request().method() !== 'PUT') return route.continue();
        await responseGate;
        await route.fulfill({
          status: 400,
          contentType: 'application/json',
          body: JSON.stringify({
            code: 'REACTION_LIMIT_REACHED',
            message: 'limit',
            requestId: randomUUID(),
          }),
        });
      });
      await article.getByTestId('add-reaction').click();
      await page.getByTestId('emoji-search').fill('fire');
      const rejected = page.waitForResponse(
        (response) =>
          response.request().method() === 'PUT' &&
          response.url().includes(`/messages/${message.id}/reactions/`),
      );
      await page.getByTestId('emoji-picker').locator('button[title=":fire:"]').click();
      await expect(article.getByTestId('reaction-🔥')).toBeVisible();
      releaseResponse();
      expect((await rejected).status()).toBe(400);
      await expect(article.getByTestId('reaction-🔥')).toHaveCount(0);
      await page.unroute(`**/messages/${message.id}/reactions/**`);
    });

    await test.step('tải lại vẫn còn cảm xúc đã lưu', async () => {
      await page.reload();
      const reloaded = page.locator(`article[data-message-id="${message.id}"]`);
      await expect(reloaded.getByTestId('reaction-👍')).toHaveAttribute('data-me', 'true', {
        timeout: 45_000,
      });
    });

    await test.step('bấm phần emoji gỡ cảm xúc → viên thuốc biến mất', async () => {
      const pill = article.getByTestId('reaction-👍');
      await pill.getByRole('button').nth(0).click();
      await expect(pill).toHaveCount(0, { timeout: 15_000 });
      await page.reload();
      await expect(
        page.locator(`article[data-message-id="${message.id}"]`).getByTestId('reaction-👍'),
      ).toHaveCount(0, { timeout: 45_000 });
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
