import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { deflateSync } from 'node:zlib';
import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import type {
  AuthResponse,
  CustomEmojiDto,
  CustomEmojiListResponse,
  MessageDto,
  ServerDetail,
  ServerSummary,
  UploadDto,
} from '@ping/shared';
import { pacedLogin } from './login-pace';

const API = 'http://localhost:4000/api/v1';
// Tên emoji dùng chung cả 3 test; afterAll xóa mọi emoji này khỏi server seed.
const EMOJI_NAME = 'test_emoji';

// PNG tĩnh 64×64 sinh thuần Node (zlib + CRC32), không thêm dependency. Worker kiểm định
// emoji tĩnh ≤128×128 (ảnh tĩnh 200×200 bị từ chối) nên 64×64 đi qua pipeline thật.
function crc32(buf: Buffer): number {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i]!;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return ~c >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
}

function png64(): Buffer {
  const size = 64;
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type RGB
  const raw = Buffer.alloc(size * (1 + size * 3));
  for (let y = 0; y < size; y++) {
    const row = y * (1 + size * 3);
    raw[row] = 0; // filter none
    for (let x = 0; x < size; x++) {
      const px = row + 1 + x * 3;
      raw[px] = (x * 4) % 256;
      raw[px + 1] = (y * 4) % 256;
      raw[px + 2] = 200;
    }
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// Upload emoji đi qua pipeline thật (reserve → PUT → complete → worker kiểm định, TG.6):
// phải có worker chạy, như sticker.spec.
let worker: ChildProcess;
test.beforeAll(() => {
  worker = spawn(process.execPath, ['dist/worker.js'], {
    cwd: resolve(__dirname, '../../api'),
    env: { ...process.env, NODE_ENV: 'development', METRICS_PORT: '' },
    windowsHide: true,
    stdio: 'ignore',
  });
});

test.afterAll(async () => {
  worker?.kill('SIGTERM');
  // PHẢI xóa emoji đã tạo trên server seed (Ping Playground) để lần chạy sau không bẩn;
  // test c có thể đã xóa qua UI rồi — chỉ xóa những cái còn sống, đúng tên của spec này.
  const login = await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'alice@ping.dev', password: 'password123' }),
  });
  if (!login.ok) throw new Error(`afterAll login → HTTP ${login.status}`);
  const headers = {
    authorization: `Bearer ${((await login.json()) as AuthResponse).accessToken}`,
  };
  const servers = (await (await fetch(`${API}/servers`, { headers })).json()) as ServerSummary[];
  const seed = servers.find((server) => server.name === 'Ping Playground');
  if (!seed) return;
  const list = (await (
    await fetch(`${API}/servers/${seed.id}/emojis`, { headers })
  ).json()) as CustomEmojiListResponse;
  for (const emoji of list.emojis) {
    if (emoji.name !== EMOJI_NAME) continue;
    const removed = await fetch(`${API}/emojis/${emoji.id}`, { method: 'DELETE', headers });
    expect(removed.ok, `xóa emoji ${emoji.name} → HTTP ${removed.status}`).toBeTruthy();
  }
});

/** Hộp xác nhận đang mở: antd giữ popup đã đóng trong DOM nên lọc theo phần tử đang hiện. */
const visiblePopconfirm = (page: Page) => page.locator('.ant-popconfirm').filter({ visible: true });

/** Vùng danh sách tin của channel: <Activity> giữ trang cũ ẩn trong DOM nên lọc :visible. */
const paneOf = (page: Page, channel: string) =>
  page.locator(`[aria-label="Tin nhắn trong #${channel}"]:visible`);

/** Đợi ảnh <img> tải xong thật sự (không chỉ có trong DOM). */
async function expectImageLoaded(image: ReturnType<Page['locator']>) {
  await expect(image).toBeVisible({ timeout: 15_000 });
  await expect
    .poll(() => image.evaluate((node) => (node as HTMLImageElement).naturalWidth))
    .toBeGreaterThan(0);
}

async function openChannel(page: Page, serverId: string, channelId: string) {
  await page.goto(`/servers/${serverId}/channels/${channelId}`);
  await expect(page.getByTestId('message-composer')).toBeVisible({ timeout: 45_000 });
}

/** Server seed + channel #general (alice là owner nên đủ quyền quản trị biểu cảm). */
async function seedServerOf(request: APIRequestContext, headers: Record<string, string>) {
  const servers = (await (
    await request.get(`${API}/servers`, { headers })
  ).json()) as ServerSummary[];
  const seed = servers.find((server) => server.name === 'Ping Playground');
  expect(seed, 'server seed "Ping Playground" phải tồn tại (chạy lại seed)').toBeTruthy();
  const detail = (await (
    await request.get(`${API}/servers/${seed!.id}`, { headers })
  ).json()) as ServerDetail;
  const general = detail.channels.find((channel) => channel.name === 'general');
  expect(general, 'channel #general phải tồn tại trên server seed').toBeTruthy();
  return { serverId: seed!.id, channelId: general!.id };
}

/**
 * Đảm bảo emoji ${EMOJI_NAME} tồn tại trên server seed — thiếu (test trước hỏng sớm) thì tạo
 * qua pipeline API thật (reserve → PUT → complete → chờ worker kiểm định → claim).
 */
async function ensureSeedEmoji(
  request: APIRequestContext,
  headers: Record<string, string>,
  serverId: string,
): Promise<CustomEmojiDto> {
  const list = (await (
    await request.get(`${API}/servers/${serverId}/emojis`, { headers })
  ).json()) as CustomEmojiListResponse;
  const existing = list.emojis.find((emoji) => emoji.name === EMOJI_NAME);
  if (existing) return existing;
  const buffer = png64();
  const uploadId = (
    (await (
      await request.post(`${API}/uploads`, {
        headers,
        data: {
          scope: 'customEmoji',
          serverId,
          filename: `${EMOJI_NAME}.png`,
          sizeBytes: buffer.length,
          nonce: randomUUID(),
        },
      })
    ).json()) as UploadDto
  ).id;
  expect(
    (await request.put(`${API}/uploads/${uploadId}/content`, { headers, data: buffer })).ok(),
  ).toBeTruthy();
  expect(
    (await request.post(`${API}/uploads/${uploadId}/complete`, { headers })).ok(),
  ).toBeTruthy();
  await expect
    .poll(
      async () =>
        ((await (await request.get(`${API}/uploads/${uploadId}`, { headers })).json()) as UploadDto)
          .status,
      { timeout: 60_000, intervals: [1_000] },
    )
    .toBe('ready');
  const created = await request.post(`${API}/servers/${serverId}/emojis`, {
    headers,
    data: { attachmentId: uploadId, name: EMOJI_NAME },
  });
  expect(created.ok()).toBeTruthy();
  return (await created.json()) as CustomEmojiDto;
}

/** Mở Cài đặt → trả về khối quản trị emoji (con của sticker-section). */
async function openSettingsEmojiSection(page: Page) {
  await page.getByRole('button', { name: 'Cài đặt', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Cài đặt server' })).toBeVisible();
  const section = page.getByTestId('sticker-section');
  await expect(section).toBeVisible({ timeout: 15_000 });
  const emojiSection = page.getByTestId('emoji-section');
  await expect(emojiSection).toBeVisible({ timeout: 15_000 });
  return emojiSection;
}

// TG.24a: upload qua quản trị (pipeline thật) → picker tab "Của server" có ảnh → chèn token
// `:ten:<id>` vào composer (chưa gửi) → Enter gửi → render ảnh; bob nhận realtime không reload.
test('emoji tùy chỉnh: upload, picker "Của server", chèn token, render và realtime', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const alice = await browser.newContext();
  const bob = await browser.newContext();
  try {
    const aliceAuth = await pacedLogin(alice.request, 'alice@ping.dev', 'password123');
    const headers = { Authorization: `Bearer ${aliceAuth.accessToken}` };
    const { serverId, channelId } = await seedServerOf(alice.request, headers);
    // bob là member của server seed → cùng channel, nhận realtime.
    await pacedLogin(bob.request, 'bob@ping.dev', 'password123');

    const page = await alice.newPage();
    const bobPage = await bob.newPage();
    await openChannel(page, serverId, channelId);
    await openChannel(bobPage, serverId, channelId);

    await test.step('quản trị: upload PNG 64×64 → form hiện khi worker kiểm định xong', async () => {
      const emojiSection = await openSettingsEmojiSection(page);
      await emojiSection.getByTestId('emoji-upload-input').setInputFiles({
        name: `${EMOJI_NAME}.png`,
        mimeType: 'image/png',
        buffer: png64(),
      });
      // Form chỉ hiện khi attachment ready (worker kiểm định xong) — chờ trần thoáng như sticker.
      const nameInput = emojiSection.getByTestId('emoji-name-input');
      await expect(nameInput).toBeVisible({ timeout: 90_000 });
      await expect(nameInput).toHaveValue(EMOJI_NAME); // prefill từ tên tệp
      await nameInput.fill(EMOJI_NAME); // tự sửa nếu prefill lệch chuẩn [a-z0-9_]
    });

    await test.step('submit → emoji-item xuất hiện trong danh sách quản trị', async () => {
      const emojiSection = page.getByTestId('emoji-section');
      await emojiSection.getByTestId('emoji-create-submit').click();
      await expect(
        emojiSection.getByTestId('emoji-item').filter({ hasText: EMOJI_NAME }),
      ).toBeVisible({ timeout: 15_000 });
    });

    await test.step('bob đồng bộ qua event expressions.updated: picker bob có emoji mới', async () => {
      await bobPage.getByTestId('emoji-button').click();
      const picker = bobPage.getByTestId('emoji-picker');
      await expect(picker).toBeVisible({ timeout: 15_000 });
      await picker.getByRole('tab', { name: 'Của server' }).click();
      const option = picker.getByRole('gridcell', { name: `Chèn emoji ${EMOJI_NAME}` });
      await expect(option).toBeVisible({ timeout: 15_000 });
      await expectImageLoaded(option.locator('img'));
      await bobPage.getByTestId('emoji-button').click(); // đóng picker
    });

    await test.step('alice: picker tab "Của server" có ảnh → bấm chèn token (chưa gửi)', async () => {
      await page.getByRole('link', { name: '# general', exact: true }).click();
      await expect(page.getByTestId('message-composer')).toBeVisible({ timeout: 45_000 });
      await page.getByTestId('emoji-button').click();
      const picker = page.getByTestId('emoji-picker');
      await expect(picker).toBeVisible({ timeout: 15_000 });
      await picker.getByRole('tab', { name: 'Của server' }).click();
      const option = picker.getByRole('gridcell', { name: `Chèn emoji ${EMOJI_NAME}` });
      await expect(option).toBeVisible({ timeout: 15_000 });
      await expectImageLoaded(option.locator('img'));
      await option.click(); // chèn token vào composer, KHÔNG gửi ngay
      await expect(picker).toHaveCount(0);
    });

    let messageId = '';
    await test.step('composer chứa token :ten:<id> → Enter gửi → tin render ảnh', async () => {
      const composer = page.getByTestId('message-composer');
      await expect(composer).toHaveValue(new RegExp(`:${EMOJI_NAME}:[0-9a-f]{8}-[0-9a-f]{4}`));
      const sent = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          /\/channels\/[0-9a-f-]+\/messages$/.test(response.url()),
        { timeout: 15_000 },
      );
      await composer.press('Enter');
      const response = await sent;
      expect(response.ok()).toBeTruthy();
      messageId = ((await response.json()) as MessageDto).id;
      await expectImageLoaded(
        paneOf(page, 'general')
          .locator(`article[data-message-id="${messageId}"]`)
          .locator('img[src*="attachments"]'),
      );
    });

    await test.step('bob nhận tin realtime (không reload) với ảnh emoji', async () => {
      await expectImageLoaded(
        paneOf(bobPage, 'general')
          .locator(`article[data-message-id="${messageId}"]`)
          .locator('img[src*="attachments"]'),
      );
    });
  } finally {
    await alice.close();
    await bob.close();
  }
});

// TG.24b: gợi ý `:test` gộp emoji server (mục có ảnh) → ArrowDown/Enter chèn token → gửi;
// thả reaction custom qua picker tab "Của server" → pill có img với token `c:<id>`.
test('emoji tùy chỉnh: gợi ý :ten: và reaction pill token c:<id>', async ({ browser }) => {
  test.setTimeout(240_000);
  const context = await browser.newContext();
  try {
    const auth = await pacedLogin(context.request, 'alice@ping.dev', 'password123');
    const headers = { Authorization: `Bearer ${auth.accessToken}` };
    const { serverId, channelId } = await seedServerOf(context.request, headers);
    const emoji = await ensureSeedEmoji(context.request, headers, serverId);

    const page = await context.newPage();
    await openChannel(page, serverId, channelId);
    const composer = page.getByTestId('message-composer');

    await test.step('gõ ":test" → listbox gợi ý có mục custom kèm ảnh nhỏ', async () => {
      await composer.fill(':test');
      const suggestions = page.getByTestId('emoji-suggestions');
      await expect(suggestions).toBeVisible({ timeout: 15_000 }); // dataset tải động lần đầu gõ ':'
      const custom = suggestions.getByRole('option').filter({ hasText: `:${EMOJI_NAME}:` });
      await expect(custom).toHaveCount(1);
      await expect(custom.locator('img')).toBeVisible(); // mục custom có ảnh nhỏ
    });

    let messageId = '';
    await test.step('ArrowDown tới mục custom → Enter chèn token → Enter gửi', async () => {
      const suggestions = page.getByTestId('emoji-suggestions');
      const custom = suggestions.getByRole('option').filter({ hasText: `:${EMOJI_NAME}:` });
      // Hệ thống (🧪 test_tube) đứng trước mục custom — di chọn tới đúng mục rồi Enter.
      for (let i = 0; i < 12 && (await custom.getAttribute('aria-selected')) !== 'true'; i++) {
        await composer.press('ArrowDown');
      }
      await expect(custom).toHaveAttribute('aria-selected', 'true');
      await composer.press('Enter'); // chấp nhận gợi ý → chèn token, chưa gửi
      await expect(suggestions).toHaveCount(0);
      await expect(composer).toHaveValue(new RegExp(`:${EMOJI_NAME}:[0-9a-f]{8}-[0-9a-f]{4}`));
      const sent = page.waitForResponse(
        (response) =>
          response.request().method() === 'POST' &&
          /\/channels\/[0-9a-f-]+\/messages$/.test(response.url()),
        { timeout: 15_000 },
      );
      await composer.press('Enter');
      const response = await sent;
      expect(response.ok()).toBeTruthy();
      messageId = ((await response.json()) as MessageDto).id;
    });

    await test.step('tin render ảnh emoji inline', async () => {
      await expectImageLoaded(
        paneOf(page, 'general')
          .locator(`article[data-message-id="${messageId}"]`)
          .locator('img[src*="attachments"]'),
      );
    });

    await test.step('reaction picker tab "Của server" → pill img với token c:<id>', async () => {
      const article = paneOf(page, 'general').locator(`article[data-message-id="${messageId}"]`);
      await article.getByTestId('add-reaction').click();
      const picker = page.getByTestId('emoji-picker'); // trong dialog chọn cảm xúc
      await expect(picker).toBeVisible({ timeout: 15_000 }); // dynamic import lần đầu
      await picker.getByRole('tab', { name: 'Của server' }).click();
      await picker.getByRole('gridcell', { name: `Chèn emoji ${EMOJI_NAME}` }).click();
      // Reaction lưu token gọn `c:<id>`; pill render ảnh h-4 w-4 qua cache server.
      const pill = article.getByTestId(`reaction-c:${emoji.id}`);
      await expect(pill).toBeVisible({ timeout: 15_000 });
      await expect(pill).toHaveAttribute('data-me', 'true');
      await expectImageLoaded(pill.locator('img'));
    });
  } finally {
    await context.close();
  }
});

// TG.24c: xóa emoji qua quản trị (Popconfirm) → tab còn lại trong channel đổi tin cũ thành
// placeholder `:ten:` và pill degrade — qua event expressions.updated, KHÔNG reload.
test('emoji tùy chỉnh: xóa → placeholder + pill degrade, đồng bộ hai tab qua event', async ({
  browser,
}) => {
  test.setTimeout(240_000);
  const alice = await browser.newContext();
  const bob = await browser.newContext();
  try {
    const auth = await pacedLogin(alice.request, 'alice@ping.dev', 'password123');
    const headers = { Authorization: `Bearer ${auth.accessToken}` };
    const { serverId, channelId } = await seedServerOf(alice.request, headers);
    const emoji = await ensureSeedEmoji(alice.request, headers, serverId);
    await pacedLogin(bob.request, 'bob@ping.dev', 'password123');

    // Tin cũ chứa token + pill reaction tạo qua API cho tất định (nhanh, không đụng UI).
    const created = await alice.request.post(`${API}/channels/${channelId}/messages`, {
      headers,
      data: { content: `:${EMOJI_NAME}:${emoji.id}`, nonce: randomUUID() },
    });
    expect(created.ok()).toBeTruthy();
    const message = (await created.json()) as MessageDto;
    expect(
      (
        await alice.request.put(
          `${API}/messages/${message.id}/reactions/${encodeURIComponent(`c:${emoji.id}`)}`,
          { headers },
        )
      ).ok(),
    ).toBeTruthy();

    const page = await alice.newPage();
    const bobPage = await bob.newPage();
    await openChannel(page, serverId, channelId);
    await openChannel(bobPage, serverId, channelId);

    const aliceArticle = paneOf(page, 'general').locator(
      `article[data-message-id="${message.id}"]`,
    );
    const bobArticle = paneOf(bobPage, 'general').locator(
      `article[data-message-id="${message.id}"]`,
    );

    await test.step('trước khi xóa: tin render ảnh và pill có img ở cả hai tab', async () => {
      for (const article of [aliceArticle, bobArticle]) {
        // Ảnh inline của tin là img "attachments" đầu tiên (pill reaction có img riêng phía sau).
        await expectImageLoaded(article.locator('img[src*="attachments"]').first());
        await expect(article.getByTestId(`reaction-c:${emoji.id}`).locator('img')).toBeVisible();
      }
    });

    await test.step('alice xóa emoji qua quản trị (Popconfirm "Xoá")', async () => {
      const emojiSection = await openSettingsEmojiSection(page);
      const item = emojiSection.getByTestId('emoji-item').filter({ hasText: EMOJI_NAME });
      await expect(item).toBeVisible({ timeout: 15_000 });
      await item.getByTestId('emoji-delete-button').click();
      await visiblePopconfirm(page).getByRole('button', { name: 'Xoá', exact: true }).click();
      await expect(item).toHaveCount(0, { timeout: 15_000 }); // invalidate → mất khỏi danh sách
    });

    await test.step('tab bob (không reload): tin cũ thành placeholder ":test_emoji:"', async () => {
      // Event expressions.updated → invalidate emoji map → node customEmoji rơi về chip văn bản.
      await expect(bobArticle.getByTestId('custom-emoji-placeholder')).toHaveText(
        `:${EMOJI_NAME}:`,
        { timeout: 20_000 },
      );
      await expect(bobArticle.locator('img[src*="attachments"]')).toHaveCount(0);
    });

    await test.step('pill reaction cũ degrade không crash: còn pill, mất img', async () => {
      const pill = bobArticle.getByTestId(`reaction-c:${emoji.id}`);
      await expect(pill).toBeVisible();
      await expect(pill.locator('img')).toHaveCount(0);
      await expect(pill).toContainText(`c:${emoji.id.slice(-8)}`); // nhãn rút gọn khi không resolve
      await expect(bobPage.getByTestId('message-composer')).toBeVisible(); // trang vẫn dùng được
    });

    await test.step('tab alice quay lại channel: tin cũ cũng thành placeholder', async () => {
      await page.getByRole('link', { name: '# general', exact: true }).click();
      await expect(page.getByTestId('message-composer')).toBeVisible({ timeout: 45_000 });
      await expect(aliceArticle.getByTestId('custom-emoji-placeholder')).toHaveText(
        `:${EMOJI_NAME}:`,
        { timeout: 20_000 },
      );
    });
  } finally {
    await alice.close();
    await bob.close();
  }
});
