import { request, type APIRequestContext } from '@playwright/test';
import type { ChannelDto, MessagePage, ServerDetail, ServerSummary } from '@ping/shared';
import { pacedLogin } from '../e2e/login-pace';

const API = 'http://localhost:4000/api/v1';
const HEALTH = `${API}/health`;
const SERVER_NAME = 'Ping Playground';
const SEEDED_CONTENT = 'Welcome to Ping! 🏓';

async function waitForApi(timeoutMs = 60_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last = 'chưa phản hồi';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(HEALTH);
      if (response.ok) return;
      last = `HTTP ${response.status}`;
    } catch (error) {
      last = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`API chưa sẵn sàng tại ${HEALTH} (${last}).`);
}

async function fetchMessages(
  context: APIRequestContext,
  headers: { Authorization: string },
  channel: ChannelDto,
) {
  const response = await context.get(`${API}/channels/${channel.id}/messages`, { headers });
  if (!response.ok()) {
    throw new Error(`GET /channels/${channel.id}/messages → HTTP ${response.status()}`);
  }
  return ((await response.json()) as MessagePage).messages;
}

export default async function globalSetup(): Promise<void> {
  await waitForApi();
  const context = await request.newContext();
  try {
    const auth = await pacedLogin(context, 'alice@ping.dev', 'password123');
    const headers = { Authorization: `Bearer ${auth.accessToken}` };

    const settings = await context.patch(`${API}/users/me/settings`, {
      headers,
      data: { theme: 'system', density: 'comfortable', fontSize: 'md', locale: 'vi' },
    });
    if (!settings.ok()) {
      throw new Error(`PATCH /users/me/settings → HTTP ${settings.status()}`);
    }

    const servers = (await (
      await context.get(`${API}/servers`, { headers })
    ).json()) as ServerSummary[];
    const server = servers.find((item) => item.name === SERVER_NAME);
    if (!server) {
      throw new Error(
        `Không thấy server seed "${SERVER_NAME}". Chạy migrate + seed trên DB sạch rồi trỏ ` +
          `DATABASE_URL vào đó (xem docs/v0.2.0/evidence/TF.13/README.md).`,
      );
    }
    const detail = (await (
      await context.get(`${API}/servers/${server.id}`, { headers })
    ).json()) as ServerDetail;
    const general = detail.channels.find((channel) => channel.name === 'general');
    if (!general) {
      throw new Error(`Server seed "${SERVER_NAME}" không có kênh #general.`);
    }

    const seeded = await fetchMessages(context, headers, general);
    if (!seeded.some((message) => message.content === SEEDED_CONTENT)) {
      // Visual chỉ chạy trên DB vừa migrate + seed: DB dev dùng chung tích thêm tin làm ảnh lệch baseline.
      throw new Error(
        `Kênh #general thiếu tin seed "${SEEDED_CONTENT}" — phải chạy trên DB sạch vừa seed, ` +
          `không dùng DB dev chung (xem docs/v0.2.0/evidence/TF.13/README.md).`,
      );
    }

    for (const channel of detail.channels) {
      const messages =
        channel.id === general.id ? seeded : await fetchMessages(context, headers, channel);
      const newest = messages[0];
      if (!newest) continue;
      const read = await context.put(`${API}/channels/${channel.id}/read`, {
        headers,
        data: { messageId: newest.id },
      });
      if (!read.ok()) throw new Error(`PUT /channels/${channel.id}/read → HTTP ${read.status()}`);
    }

    process.env.VISUAL_SERVER_ID = server.id;
    process.env.VISUAL_CHANNEL_ID = general.id;
  } finally {
    await context.dispose();
  }
}
