import { randomUUID } from 'node:crypto';
import { expect, type APIRequestContext, type Page } from '@playwright/test';
import type { AuthResponse, ChannelDto, MessageDto, ServerDetail } from '@ping/shared';
import { ensureUserVerified } from './global-setup';
import { paceLogin } from './login-pace';

// Dữ liệu demo cho các spec của skin Pop (ADR-0084): người dùng riêng có tên dễ nhìn, một server,
// một kênh có chủ đề, tin nhắn của hai người và reaction. Không đụng user e2e dùng chung.
const API = 'http://localhost:4000/api/v1';
export const DEMO_PASSWORD = 'e2e-password';

export interface Demo {
  email: string;
  serverId: string;
  channelId: string;
}

const register = async (request: APIRequestContext, username: string, displayName: string) => {
  const email = `${username}-${randomUUID().slice(0, 6)}@example.test`;
  const response = await request.post(`${API}/auth/register`, {
    data: { email, username, displayName, password: DEMO_PASSWORD },
  });
  return { email, auth: (await response.json()) as AuthResponse };
};

export async function seedDemo(request: APIRequestContext): Promise<Demo> {
  const suffix = randomUUID().slice(0, 3);
  const owner = await register(request, `thien.${suffix}`, 'Thiên');
  const bob = await register(request, `leila.${suffix}`, 'Leila');
  await ensureUserVerified(owner.email);
  const ownerHeaders = { Authorization: `Bearer ${owner.auth.accessToken}` };
  const bobHeaders = { Authorization: `Bearer ${bob.auth.accessToken}` };

  const server = (await (
    await request.post(`${API}/servers`, { headers: ownerHeaders, data: { name: 'Ping HQ' } })
  ).json()) as ServerDetail;
  await request.post(`${API}/servers/join`, {
    headers: bobHeaders,
    data: { inviteCode: server.inviteCode },
  });
  const channel = (await (
    await request.post(`${API}/servers/${server.id}/channels`, {
      headers: ownerHeaders,
      data: { name: 'thiet-ke' },
    })
  ).json()) as ChannelDto;

  await request.patch(`${API}/channels/${channel.id}/topic`, {
    headers: ownerHeaders,
    data: { topic: 'Bản build v0.2.0 lên staging hôm nay · nhớ chạy e2e trước khi merge' },
  });

  const say = async (headers: Record<string, string>, content: string) =>
    (await (
      await request.post(`${API}/channels/${channel.id}/messages`, {
        headers,
        data: { content, nonce: randomUUID() },
      })
    ).json()) as MessageDto;
  const react = (headers: Record<string, string>, message: MessageDto, emoji: string) =>
    request.put(`${API}/messages/${message.id}/reactions/${encodeURIComponent(emoji)}`, {
      headers,
    });

  const first = await say(bobHeaders, 'Bản build mới đã lên staging, mọi người thử giúp nhé.');
  await say(ownerHeaders, 'Đã chạy xong e2e, tất cả đều xanh.');
  const third = await say(bobHeaders, 'Tuyệt, mình merge luôn.');
  await say(ownerHeaders, 'Nhớ cập nhật ADR trước khi merge nhé.');
  await react(ownerHeaders, first, '👍');
  await react(bobHeaders, first, '👍');
  await react(ownerHeaders, third, '🎉');
  return { email: owner.email, serverId: server.id, channelId: channel.id };
}

/** Đăng nhập bằng giao diện (có pacing để không chạm hạn mức 10 lần/phút). */
export async function signInAs(page: Page, demo: Demo) {
  await paceLogin();
  await page.goto('/login');
  await page.getByLabel('Email').filter({ visible: true }).fill(demo.email);
  await page.getByLabel('Mật khẩu').filter({ visible: true }).fill(DEMO_PASSWORD);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page.getByRole('link', { name: '# general' })).toBeVisible();
}
