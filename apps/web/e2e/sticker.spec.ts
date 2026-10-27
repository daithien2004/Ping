import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import type { ServerDetail, ServerSummary, StickerDto, UploadDto } from '@ping/shared';
import { pacedLogin } from './login-pace';

const API = 'http://localhost:4000/api/v1';
// PNG fixture được sinh cục bộ, không dùng tài nguyên ngoài (như attachment.spec).
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAACgAAAAeCAIAAADRv8uKAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAN0lEQVRIie3VwQkAQAgDwe2/6VwZ3mPAvyAx0+pksjinnnDlnVIgU5lBIiyGxbA4LIbFsLivWHw+nauNqku18gAAAABJRU5ErkJggg==',
  'base64',
);

// Upload sticker đi qua pipeline thật (reserve → PUT → complete → worker kiểm định, TG.6):
// phải có worker chạy, giống attachment.spec.
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

/** Hộp xác nhận đang mở: antd giữ popup đã đóng trong DOM nên lọc theo phần tử đang hiện. */
const visiblePopconfirm = (page: Page) => page.locator('.ant-popconfirm').filter({ visible: true });

/** Vùng danh sách tin của channel: <Activity> giữ trang cũ ẩn trong DOM nên lọc :visible. */
const paneOf = (page: Page, channel: string) =>
  page.locator(`[aria-label="Tin nhắn trong #${channel}"]:visible`);

/** Mở sticker picker (dynamic import lần đầu có thể chậm) rồi trả về locator của nó. */
async function openStickerPicker(page: Page) {
  await page.getByTestId('sticker-button').click();
  const picker = page.getByTestId('sticker-picker');
  await expect(picker).toBeVisible({ timeout: 15_000 });
  return picker;
}

// TG.22a+b: gửi sticker hệ thống qua picker (realtime sang context thứ hai) và tìm không dấu.
test('sticker picker: tabs, gửi realtime, tìm không dấu "cuoi"', async ({ browser }) => {
  test.setTimeout(240_000);
  const alice = await browser.newContext();
  const bob = await browser.newContext();
  try {
    const aliceAuth = await pacedLogin(alice.request, 'alice@ping.dev', 'password123');
    const headers = { Authorization: `Bearer ${aliceAuth.accessToken}` };
    const servers = (await (
      await alice.request.get(`${API}/servers`, { headers })
    ).json()) as ServerSummary[];
    const seed = servers.find((server) => server.name === 'Ping Playground');
    expect(seed, 'server seed "Ping Playground" phải tồn tại (chạy lại seed)').toBeTruthy();
    const detail = (await (
      await alice.request.get(`${API}/servers/${seed!.id}`, { headers })
    ).json()) as ServerDetail;
    const general = detail.channels.find((channel) => channel.name === 'general')!;
    // bob là member của server seed → cùng channel, nhận realtime.
    await pacedLogin(bob.request, 'bob@ping.dev', 'password123');

    const page = await alice.newPage();
    const bobPage = await bob.newPage();
    await page.goto(`/servers/${seed!.id}/channels/${general.id}`);
    await bobPage.goto(`/servers/${seed!.id}/channels/${general.id}`);
    await expect(page.getByTestId('message-composer')).toBeVisible({ timeout: 45_000 });
    await expect(bobPage.getByTestId('message-composer')).toBeVisible({ timeout: 45_000 });

    await test.step('mở picker: đủ 3 tab Gần đây / Hệ thống / Của server', async () => {
      const picker = await openStickerPicker(page);
      await expect(picker.getByRole('tab', { name: 'Gần đây' })).toBeVisible();
      await expect(picker.getByRole('tab', { name: 'Hệ thống' })).toBeVisible();
      await expect(picker.getByRole('tab', { name: 'Của server' })).toBeVisible();
    });

    await test.step('tab Hệ thống: bấm "Cười" là gửi ngay tin sticker', async () => {
      const picker = page.getByTestId('sticker-picker');
      await picker.getByRole('tab', { name: 'Hệ thống' }).click();
      await picker.getByRole('gridcell', { name: 'Gửi sticker Cười', exact: true }).click();
      await expect(picker).toHaveCount(0); // chọn xong picker đóng
      const image = paneOf(page, 'general').locator('article').last().getByTestId('sticker-image');
      await expect(image).toBeVisible({ timeout: 15_000 });
      await expect
        .poll(() => image.evaluate((node) => (node as HTMLImageElement).naturalWidth))
        .toBeGreaterThan(0);
    });

    await test.step('bob nhận tin sticker realtime, không reload', async () => {
      await expect(
        paneOf(bobPage, 'general').locator('article').last().getByTestId('sticker-image'),
      ).toBeVisible({ timeout: 15_000 });
    });

    await test.step('tìm không dấu "cuoi": còn đúng sticker Cười', async () => {
      const picker = await openStickerPicker(page);
      await picker.getByTestId('sticker-search').fill('cuoi');
      const first = picker.getByTestId('sticker-option').first();
      await expect(first).toBeVisible({ timeout: 15_000 });
      await expect(first).toHaveAttribute('aria-label', /Cười/);
      // Sticker không khớp truy vấn phải bị lọc ra khỏi grid.
      await expect(picker.getByRole('gridcell', { name: 'Gửi sticker Tên lửa' })).toHaveCount(0);
      await page.getByTestId('sticker-button').click(); // đóng picker
    });
  } finally {
    await alice.close();
    await bob.close();
  }
});

// TG.22c: upload qua quản trị (pipeline thật), gửi từ picker tab "Của server", xóa có
// Popconfirm → tin cũ trong pane đổi thành khung "sticker đã bị xóa" sau invalidate/refetch.
test('sticker quản trị: upload, gửi, xóa → tin cũ thành "đã xóa"', async ({ browser }) => {
  test.setTimeout(240_000);
  const alice = await browser.newContext();
  try {
    const auth = await pacedLogin(alice.request, 'alice@ping.dev', 'password123');
    const headers = { Authorization: `Bearer ${auth.accessToken}` };
    const suffix = randomUUID().slice(0, 8);
    const stickerName = `stkr${suffix}`;
    // Server riêng cho test, xóa ở cuối — không đụng dữ liệu seed.
    const server = (await (
      await alice.request.post(`${API}/servers`, {
        headers,
        data: { name: `Sticker ${suffix}` },
      })
    ).json()) as ServerDetail;
    const channelId = server.channels[0]!.id;

    const page = await alice.newPage();
    await page.goto(`/servers/${server.id}/channels/${channelId}`);
    await expect(page.getByTestId('message-composer')).toBeVisible({ timeout: 45_000 });

    await test.step('mở Cài đặt → upload PNG nhỏ, đợi worker kiểm định xong', async () => {
      await page.getByRole('button', { name: 'Cài đặt', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Cài đặt server' })).toBeVisible();
      const section = page.getByTestId('sticker-section');
      await expect(section).toBeVisible({ timeout: 15_000 });
      await section.getByTestId('sticker-upload-input').setInputFiles({
        name: `${stickerName}.png`,
        mimeType: 'image/png',
        buffer: png,
      });
      // Form chỉ hiện khi attachment ready (worker kiểm định xong) — như attachment.spec
      // chờ "Sẵn sàng gửi" với trần 60s, ở đây chờ form với trần thoáng hơn.
      const nameInput = section.getByTestId('sticker-name-input');
      await expect(nameInput).toBeVisible({ timeout: 90_000 });
      await expect(nameInput).toHaveValue(stickerName); // tên gợi ý từ tên tệp
    });

    await test.step('submit tạo sticker → item mới trong danh sách quản trị', async () => {
      const section = page.getByTestId('sticker-section');
      await section.getByTestId('sticker-create-submit').click();
      await expect(
        section.getByTestId('sticker-item').filter({ hasText: stickerName }),
      ).toBeVisible({ timeout: 15_000 });
    });

    await test.step('picker tab "Của server" có sticker mới → gửi vào #general', async () => {
      await page.getByRole('link', { name: '# general', exact: true }).click();
      await expect(page.getByTestId('message-composer')).toBeVisible({ timeout: 45_000 });
      const picker = await openStickerPicker(page);
      await picker.getByRole('tab', { name: 'Của server' }).click();
      const option = picker.getByRole('gridcell', { name: `Gửi sticker ${stickerName}` });
      await expect(option).toBeVisible({ timeout: 15_000 });
      // Đợi POST tin sticker trả 2xx (tin đã được lưu) trước khi sang bước xóa: nếu xóa
      // trong khi POST còn xử lý, server từ chối tin ("Sticker unavailable") vì đọc thấy
      // sticker đã xóa — tin không bao giờ tồn tại để đổi thành khung "đã xóa".
      const sent = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          /\/channels\/[0-9a-f-]+\/messages$/.test(response.url()),
      );
      await option.click();
      expect((await sent).ok()).toBeTruthy();
      await expect(
        paneOf(page, 'general').locator('article').last().getByTestId('sticker-image'),
      ).toBeVisible({ timeout: 15_000 });
    });

    await test.step('xóa sticker qua Popconfirm → tin cũ đổi thành khung "đã xóa"', async () => {
      await page.getByRole('button', { name: 'Cài đặt', exact: true }).click();
      await expect(page.getByRole('heading', { name: 'Cài đặt server' })).toBeVisible();
      const section = page.getByTestId('sticker-section');
      const item = section.getByTestId('sticker-item').filter({ hasText: stickerName });
      await expect(item).toBeVisible({ timeout: 15_000 });
      await item.getByTestId('sticker-delete-button').click();
      await visiblePopconfirm(page).getByRole('button', { name: 'Xoá', exact: true }).click();
      // invalidate stickers → item biến mất khỏi danh sách quản trị.
      await expect(item).toHaveCount(0, { timeout: 15_000 });
      // Về lại channel: cache tin nhắn bị invalidate ['channels'] → refetch → tin cũ render
      // khung "sticker đã bị xóa" thay vì ảnh.
      await page.getByRole('link', { name: '# general', exact: true }).click();
      const pane = paneOf(page, 'general');
      await expect(pane.getByTestId('sticker-image')).toHaveCount(0, { timeout: 15_000 });
      await expect(pane.getByTestId('sticker-deleted')).toHaveCount(1);
    });

    const cleanup = await alice.request.delete(`${API}/servers/${server.id}`, { headers });
    expect(cleanup.ok()).toBeTruthy();
  } finally {
    await alice.close();
  }
});

// TG.22d: prefers-reduced-motion: reduce → tin sticker dùng khung preview tĩnh của server
// (URL có &thumbnail=1) thay vì ảnh động. Context tự tạo qua browser.newContext() không nhận
// test.use nên truyền reducedMotion thẳng vào context.
test('sticker reduced motion: render qua preview server (thumbnail=1)', async ({ browser }) => {
  test.setTimeout(240_000);
  const alice = await browser.newContext({ reducedMotion: 'reduce' });
  try {
    const auth = await pacedLogin(alice.request, 'alice@ping.dev', 'password123');
    const headers = { Authorization: `Bearer ${auth.accessToken}` };
    const suffix = randomUUID().slice(0, 8);
    // Server riêng cho test, xóa ở cuối — không đụng dữ liệu seed.
    const server = (await (
      await alice.request.post(`${API}/servers`, {
        headers,
        data: { name: `Reduce ${suffix}` },
      })
    ).json()) as ServerDetail;
    const channelId = server.channels[0]!.id;
    // Sticker hệ thống của seed chỉ có tệp .ready (không .thumb) nên previewUrl của nó trả
    // 503 — với reduce tin đó rơi về khung "đã xóa". Tạo sticker qua pipeline thật ở đây:
    // worker sinh .thumb khi kiểm định → reduce có khung preview để render.
    const uploadId = (
      (await (
        await alice.request.post(`${API}/uploads`, {
          headers,
          data: {
            scope: 'sticker',
            serverId: server.id,
            filename: `${suffix}.png`,
            sizeBytes: png.length,
            nonce: randomUUID(),
          },
        })
      ).json()) as UploadDto
    ).id;
    expect(
      (await alice.request.put(`${API}/uploads/${uploadId}/content`, { headers, data: png })).ok(),
    ).toBeTruthy();
    expect(
      (await alice.request.post(`${API}/uploads/${uploadId}/complete`, { headers })).ok(),
    ).toBeTruthy();
    // Đợi worker kiểm định xong (attachment ready) — pipeline thật, không bỏ qua.
    await expect
      .poll(
        async () => {
          const status = (await (
            await alice.request.get(`${API}/uploads/${uploadId}`, { headers })
          ).json()) as UploadDto;
          return status.status;
        },
        { timeout: 60_000, intervals: [1_000] },
      )
      .toBe('ready');
    const sticker = (await (
      await alice.request.post(`${API}/servers/${server.id}/stickers`, {
        headers,
        data: { attachmentId: uploadId, name: `rm ${suffix}`, tags: [] },
      })
    ).json()) as StickerDto;

    // Gửi tin sticker qua API rồi xem ở chế độ reduce.
    expect(
      (
        await alice.request.post(`${API}/channels/${channelId}/messages`, {
          headers,
          data: { content: '', nonce: randomUUID(), stickerId: sticker.id },
        })
      ).ok(),
    ).toBeTruthy();

    const page = await alice.newPage();
    await page.goto(`/servers/${server.id}/channels/${channelId}`);
    await expect(page.getByTestId('message-composer')).toBeVisible({ timeout: 45_000 });
    const image = paneOf(page, 'general').getByTestId('sticker-image');
    await expect(image).toHaveCount(1, { timeout: 15_000 });
    await expect(image).toHaveAttribute('src', /thumbnail=1/);
    await expect
      .poll(() => image.evaluate((node) => (node as HTMLImageElement).naturalWidth))
      .toBeGreaterThan(0);

    const cleanup = await alice.request.delete(`${API}/servers/${server.id}`, { headers });
    expect(cleanup.ok()).toBeTruthy();
  } finally {
    await alice.close();
  }
});
