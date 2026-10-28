import { randomUUID } from 'node:crypto';
import { expect, test, type Page } from '@playwright/test';
import type { AuthResponse, ServerDetail, ServerSummary } from '@ping/shared';
import { pacedLogin } from './login-pace';

const API = 'http://localhost:4000/api/v1';
const SEED_PASSWORD = 'password123';
// Seed (apps/api/prisma/seed.ts): alice/bob là member "Ping Playground", bob có nickname "Bobby".
const ALICE_ID = '01990000-0000-7000-8000-000000000001';
const BOB_ID = '01990000-0000-7000-8000-000000000002';

/** Hộp xác nhận đang mở: antd giữ popup đã đóng trong DOM nên lọc theo phần tử đang hiện. */
const visiblePopconfirm = (page: Page) => page.locator('.ant-popconfirm').filter({ visible: true });

/** Vùng danh sách tin của DM: <Activity> giữ trang cũ ẩn trong DOM nên lọc :visible. */
const dmPaneOf = (page: Page, partnerName: string) =>
  page.locator(`[aria-label="Tin nhắn với ${partnerName}"]:visible`);

/** Ô soạn tin đang HIỆN: trang cũ bị <Activity> giữ ẩn vẫn còn composer trong DOM. */
const composerOf = (page: Page) => page.locator('[data-testid="message-composer"]:visible');

/**
 * TG.9 (ADR-0070): DM 1:1 + chặn người dùng — chạy NỐI TIẾP trong một test (workers:1 của
 * playwright.config giữ nguyên): một cặp alice-bob xuyên suốt (a)→(c) và một user mới đăng
 * ký tại chỗ cho (d) để đảm bảo cặp DM CHƯA tồn tại (get-or-create với cặp cũ luôn 200, sẽ
 * che mất lỗi DM_BLOCKED). Các context cùng một run, không shard.
 */
test('TG.9: tạo DM từ profile card, gửi tin, badge realtime, chặn/bỏ chặn, dmAllow=none', async ({
  browser,
}) => {
  test.setTimeout(360_000);
  const aliceCtx = await browser.newContext();
  const bobCtx = await browser.newContext();
  const freshCtx = await browser.newContext();
  let aliceHeaders: Record<string, string> = {};
  let bobHeaders: Record<string, string> = {};
  try {
    const aliceAuth = await pacedLogin(aliceCtx.request, 'alice@ping.dev', SEED_PASSWORD);
    const bobAuth = await pacedLogin(bobCtx.request, 'bob@ping.dev', SEED_PASSWORD);
    aliceHeaders = { Authorization: `Bearer ${aliceAuth.accessToken}` };
    bobHeaders = { Authorization: `Bearer ${bobAuth.accessToken}` };
    // DM là dữ liệu BỀN giữa các lần chạy spec — nội dung tin phải duy nhất mỗi lần chạy.
    const suffix = randomUUID().slice(0, 8);

    // Server seed chung cho alice + bob; #general là điểm vào danh sách thành viên.
    const servers = (await (
      await aliceCtx.request.get(`${API}/servers`, { headers: aliceHeaders })
    ).json()) as ServerSummary[];
    const seed = servers.find((server) => server.name === 'Ping Playground');
    expect(seed, 'server seed "Ping Playground" phải tồn tại (chạy lại seed)').toBeTruthy();
    const detail = (await (
      await aliceCtx.request.get(`${API}/servers/${seed!.id}`, { headers: aliceHeaders })
    ).json()) as ServerDetail;
    const general = detail.channels.find((channel) => channel.name === 'general')!;

    const alice = await aliceCtx.newPage();
    // Đợi GET /dms của rail kịp trả trước khi bob gửi (b): event realtime giữa chừng lúc
    // query đang bay sẽ bị lần fetch đó ghi đè (race có sẵn của pattern badge, không liên quan TG.9).
    const dmsLoaded = alice.waitForResponse((res) => res.url() === `${API}/dms` && res.ok(), {
      timeout: 20_000,
    });
    await alice.goto(`/servers/${seed!.id}/channels/${general.id}`);
    await expect(composerOf(alice)).toBeVisible({ timeout: 45_000 });
    await dmsLoaded;

    await test.step('(a) profile card bob → "Nhắn tin" → DM → gửi tin như tin thường', async () => {
      await alice.getByTestId('member-row').filter({ hasText: 'Bobby' }).click();
      await expect(alice.getByTestId('member-profile')).toBeVisible();
      await expect(alice.getByTestId('send-dm-button')).toBeEnabled();
      await expect(alice.getByTestId('block-user-button')).toBeVisible();
      await alice.getByTestId('send-dm-button').click();
      // Get-or-create 200 → điều hướng /dms/:channelId (route riêng vì DM không có serverId).
      await expect(alice).toHaveURL(/\/dms\/[0-9a-f-]{36}$/);
      await expect(composerOf(alice)).toBeVisible({ timeout: 45_000 });
      // Header DM hiển thị partner theo hồ sơ user (không phải nickname "Bobby" trong server).
      await expect(alice.getByTestId('dm-header')).toContainText('Bob Tran');

      // Nội dung duy nhất mỗi lần chạy: DM là dữ liệu bền giữa các lần chạy spec.
      const content = `chào Bob từ TG.9 ${suffix}`;
      const composer = composerOf(alice);
      await composer.fill(content);
      await composer.press('Enter');
      await expect(
        dmPaneOf(alice, 'Bob Tran').locator('article').filter({ hasText: content }),
      ).toBeVisible({ timeout: 15_000 });
    });

    const dmChannelId =
      await test.step('(b) bob gửi qua API → badge đỏ mục DM, không reload', async () => {
        // Rời DM về kênh server để DM không còn là channel đang xem (mark-read không nuốt badge).
        await alice.goto(`/servers/${seed!.id}/channels/${general.id}`);
        await expect(composerOf(alice)).toBeVisible({ timeout: 45_000 });

        const dms = (await (
          await aliceCtx.request.get(`${API}/dms`, { headers: aliceHeaders })
        ).json()) as {
          dms: Array<{ channelId: string; partner: { id: string }; unreadCount: number }>;
        };
        const dm = dms.dms.find((row) => row.partner.id === BOB_ID);
        expect(dm, 'DM alice↔bob phải có trong GET /dms').toBeTruthy();
        // Baseline chưa đọc (dữ liệu bền giữa các lần chạy) → tin mới của bob phải cộng đúng 1.
        const baseline = dm!.unreadCount;

        const sent = await bobCtx.request.post(`${API}/channels/${dm!.channelId}/messages`, {
          headers: bobHeaders,
          data: { content: `tin DM thử badge ${suffix}`, nonce: randomUUID() },
        });
        expect(sent.ok()).toBeTruthy();

        // Badge mention-style trên mục DM của rail (mọi tin DM đều tính như mention).
        await expect(alice.getByTestId('dm-rail')).toHaveAttribute(
          'aria-label',
          new RegExp(`${baseline + 1} tin chưa đọc`),
          { timeout: 15_000 },
        );

        // Mở /dms: hàng hội thoại có badge + aria đủ thông tin → bấm vào → badge dọn sau mark-read.
        await alice.getByTestId('dm-rail').click();
        await expect(alice).toHaveURL(/\/dms$/);
        const row = alice.getByTestId('dm-row').filter({ hasText: 'Bob Tran' });
        await expect(row).toHaveAttribute(
          'aria-label',
          new RegExp(`${baseline + 1} tin chưa đọc`),
          { timeout: 15_000 },
        );
        await row.click();
        await expect(alice).toHaveURL(/\/dms\/[0-9a-f-]{36}$/);
        await expect(composerOf(alice)).toBeVisible({ timeout: 45_000 });
        await expect(
          dmPaneOf(alice, 'Bob Tran')
            .locator('article')
            .filter({ hasText: `tin DM thử badge ${suffix}` }),
        ).toBeVisible({ timeout: 15_000 });
        // Đã xem = mark-read tự chạy → rail về nhãn không có số.
        await expect(alice.getByTestId('dm-rail')).toHaveAttribute(
          'aria-label',
          'Tin nhắn trực tiếp',
          {
            timeout: 15_000,
          },
        );
        return dm!.channelId;
      });

    await test.step('(c) chặn → composer tắt + banner; bob gửi 403 DM_BLOCKED; bỏ chặn → gửi lại OK', async () => {
      await alice.getByTestId('dm-block').click();
      await visiblePopconfirm(alice).getByRole('button', { name: 'Chặn', exact: true }).click();
      // Banner + composer tắt (ability mất SEND_MESSAGES → composer về trạng thái không gửi).
      await expect(alice.getByTestId('dm-blocked-banner')).toBeVisible({ timeout: 15_000 });
      await expect(composerOf(alice)).toBeHidden();

      const blocked = await bobCtx.request.post(`${API}/channels/${dmChannelId}/messages`, {
        headers: bobHeaders,
        data: { content: 'bob vẫn gửi thử', nonce: randomUUID() },
      });
      expect(blocked.status()).toBe(403);
      expect(((await blocked.json()) as { code: string }).code).toBe('DM_BLOCKED');

      await alice.getByTestId('dm-unblock').click();
      await visiblePopconfirm(alice).getByRole('button', { name: 'Bỏ chặn', exact: true }).click();
      await expect(alice.getByTestId('dm-blocked-banner')).toBeHidden({ timeout: 15_000 });
      await expect(composerOf(alice)).toBeVisible({ timeout: 15_000 });

      const content = `bỏ chặn rồi, gửi lại được ${suffix}`;
      const composer = composerOf(alice);
      await composer.fill(content);
      await composer.press('Enter');
      await expect(
        dmPaneOf(alice, 'Bob Tran').locator('article').filter({ hasText: content }),
      ).toBeVisible({ timeout: 15_000 });
    });

    await test.step('(d) đối phương dmAllow=none → tạo DM mới 403, UI toast đúng message', async () => {
      // bob tắt nhận DM qua PATCH riêng tư (màn cài đặt thuộc TG.13, e2e đi qua API).
      const privacy = await bobCtx.request.patch(`${API}/users/me/privacy`, {
        headers: bobHeaders,
        data: { dmAllow: 'none' },
      });
      expect(privacy.ok()).toBeTruthy();

      // Server phủi tay của bob để user mới dùng chung server với bob mà không đụng seed.
      const throwawaySuffix = randomUUID().slice(0, 8);
      const throwaway = (await (
        await bobCtx.request.post(`${API}/servers`, {
          headers: bobHeaders,
          data: { name: `DM Privacy ${throwawaySuffix}` },
        })
      ).json()) as ServerDetail;

      // User mới: cặp DM với bob chắc chắn chưa tồn tại → POST /dms mới chạm được điều kiện dmAllow.
      const freshAuth = (await (
        await freshCtx.request.post(`${API}/auth/register`, {
          data: {
            email: `dm-e2e-${throwawaySuffix}@example.test`,
            username: `dm_e2e_${throwawaySuffix}`,
            password: 'e2e-password',
          },
        })
      ).json()) as AuthResponse;
      const joined = await freshCtx.request.post(`${API}/servers/join`, {
        headers: { Authorization: `Bearer ${freshAuth.accessToken}` },
        data: { inviteCode: throwaway.inviteCode },
      });
      expect(joined.ok()).toBeTruthy();
      await pacedLogin(freshCtx.request, `dm-e2e-${throwawaySuffix}@example.test`, 'e2e-password');

      const fresh = await freshCtx.newPage();
      await fresh.goto(`/servers/${throwaway.id}/channels/${throwaway.channels[0]!.id}`);
      await expect(composerOf(fresh)).toBeVisible({ timeout: 45_000 });
      await fresh.getByTestId('member-row').filter({ hasText: 'Bob Tran' }).click();
      await expect(fresh.getByTestId('member-profile')).toBeVisible();
      // Bấm "Nhắn tin" → POST /dms 403 DM_BLOCKED → toast đúng câu i18n, không điều hướng.
      await fresh.getByTestId('send-dm-button').click();
      await expect(
        fresh.getByText(
          'Không nhắn được: một trong hai người đã chặn hoặc đã tắt nhận tin nhắn riêng.',
        ),
      ).toBeVisible({ timeout: 15_000 });
      await expect(fresh).toHaveURL(new RegExp(`/servers/${throwaway.id}/`));

      // Dọn dẹp: trả dmAllow về mặc định và xóa server phủi tay (không đụng dữ liệu seed).
      const restore = await bobCtx.request.patch(`${API}/users/me/privacy`, {
        headers: bobHeaders,
        data: { dmAllow: 'server_members' },
      });
      expect(restore.ok()).toBeTruthy();
      const cleanup = await bobCtx.request.delete(`${API}/servers/${throwaway.id}`, {
        headers: bobHeaders,
      });
      expect(cleanup.ok()).toBeTruthy();
    });
  } finally {
    // Chặn sót (test đỏ giữa chừng) phải được gỡ để chạy lại spec không dính DM_BLOCKED.
    await aliceCtx.request.delete(`${API}/users/${BOB_ID}/block`, { headers: aliceHeaders });
    await bobCtx.request.delete(`${API}/users/${ALICE_ID}/block`, { headers: bobHeaders });
    await bobCtx.request.patch(`${API}/users/me/privacy`, {
      headers: bobHeaders,
      data: { dmAllow: 'server_members' },
    });
    await aliceCtx.close();
    await bobCtx.close();
    await freshCtx.close();
  }
});
