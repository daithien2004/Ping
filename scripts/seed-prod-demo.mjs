#!/usr/bin/env node
/**
 * Seed dữ liệu demo trên production qua API công khai (không ghi thẳng DB).
 * Idempotent: nonce tin nhắn sinh từ (kênh, thứ tự) nên chạy lại không tạo bản trùng.
 * Mật khẩu đọc từ .env.demo (hoặc biến môi trường) và không bao giờ được in ra.
 */
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const envFile = path.join(root, '.env.demo');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const BASE = (process.env.PING_URL ?? '').replace(/\/+$/, '');
const SERVER_NAME = process.env.DEMO_SERVER_NAME ?? 'Ping Demo';
const OWNER = {
  email: process.env.OWNER_EMAIL,
  password: process.env.OWNER_PASSWORD,
  username: 'owner-demo',
  displayName: 'Owner Demo',
};
const DEMO_PASSWORD = process.env.DEMO_PASSWORD;
const DEMO1 = {
  email: process.env.DEMO1_EMAIL,
  password: process.env.DEMO1_PASSWORD ?? DEMO_PASSWORD,
  username: 'demo1',
  displayName: 'Demo 1',
};
const DEMO2 = {
  email: process.env.DEMO2_EMAIL,
  password: process.env.DEMO2_PASSWORD ?? DEMO_PASSWORD,
  username: 'demo2',
  displayName: 'Demo 2',
};

const CHANNELS = ['general', 'random', 'dev'];
const REGISTER_GAP_MS = 13_000;
const SEND_GAP_MS = 300;

function stop(message) {
  console.error(`\n✖ ${message}`);
  process.exit(1);
}

if (!BASE) stop('Thiếu PING_URL (ví dụ https://20.193.75.48).');
for (const [label, account] of Object.entries({ OWNER, DEMO1, DEMO2 })) {
  if (!account.email || !account.password)
    stop(`Thiếu ${label}_EMAIL hoặc mật khẩu trong .env.demo`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function stableUuid(key) {
  const hex = createHash('sha256').update(key).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

async function api(pathname, { method = 'GET', token, body } = {}) {
  const response = await fetch(`${BASE}/api/v1${pathname}`, {
    method,
    headers: {
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;
  if (!response.ok) {
    const error = new Error(`${method} ${pathname} → ${response.status}`);
    error.status = response.status;
    error.code = data?.code;
    error.requestId = response.headers.get('x-request-id');
    error.detail = data?.message;
    throw error;
  }
  return data;
}

async function tryLogin(account) {
  try {
    return await api('/auth/login', {
      method: 'POST',
      body: { email: account.email, password: account.password },
    });
  } catch (error) {
    if (error.status === 401) return null;
    throw error;
  }
}

let lastRegisterAt = 0;
async function ensureAccount(account, label) {
  const existing = await tryLogin(account);
  if (existing) {
    console.log(`• ${label}: đăng nhập sẵn có (${account.email})`);
    return { token: existing.accessToken, user: existing.user, created: false };
  }
  const wait = lastRegisterAt + REGISTER_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  const created = await api('/auth/register', {
    method: 'POST',
    body: {
      email: account.email,
      username: account.username,
      password: account.password,
      displayName: account.displayName,
    },
  });
  lastRegisterAt = Date.now();
  console.log(`• ${label}: đã đăng ký (${account.email})`);
  return { token: created.accessToken, user: created.user, created: true };
}

const CONTENT = {
  general: [
    ['owner', 'Chào mọi người, đây là server demo của Ping. Mình bắt đầu ở kênh này.'],
    [
      'owner',
      'Ba kênh: general để trao đổi chung, random để nói linh tinh, dev để bàn chuyện code.',
    ],
    ['demo1', 'Mình vào rồi, giao diện đọc khá rõ ở cả nền sáng và nền tối.'],
    [
      'owner',
      'Luật server: tôn trọng nhau, không spam, không gửi tệp lạ. Mình ghim tin này cho người mới.',
    ],
    ['demo2', 'Mình cũng vào rồi. Có cần giới thiệu ở random không?'],
    ['owner', 'Có, mỗi người một câu cho dễ nhớ tên.'],
    ['demo1', 'Thử gửi tin có trả lời xem đoạn trích hiện thế nào.'],
    ['demo2', 'Tin trả lời hiện đúng đoạn trích của tin gốc, bấm vào là nhảy tới.', 7],
    ['owner', 'Thả cảm xúc vào tin này xem thanh reaction có cập nhật ngay không.'],
    ['demo1', 'Cập nhật ngay, không phải tải lại trang.'],
    ['demo2', 'Mình kéo lên thử xem tin cũ có tải dần không.'],
    ['owner', 'Tin cũ tải dần, tới đầu kênh vẫn giữ đúng vị trí đang đọc.'],
    ['demo1', 'Mở hai tab, gửi ở tab này xem tab kia có nhận ngay không.'],
    ['demo2', 'Nhận ngay, không cần F5.'],
    ['owner', 'Thử nút Hỏi AI ở góc phải xem nó tóm tắt đoạn hội thoại thế nào.'],
    ['demo1', 'Câu trả lời có trích dẫn tin gốc, bấm vào là tới đúng chỗ.'],
    ['demo2', 'Vậy là đủ một vòng demo. Cảm ơn mọi người.'],
    ['demo1', 'Mình để lại câu hỏi: tính năng nào bạn muốn thử tiếp?'],
  ],
  random: [
    ['demo1', 'Cuối tuần này ai đi cà phê không?'],
    ['demo2', 'Mình đang uống cà phê muối, ngon hơn mình tưởng.'],
    ['demo1', 'Quán nào thế, cho xin địa chỉ với.', 2],
    ['demo2', 'Quán gần hồ, buổi chiều ngồi ngoài khá mát.'],
    ['owner', 'Mình vừa xem một bộ phim về lập trình viên, hơi sến nhưng vui.'],
    ['demo1', 'Phim đó đoạn cuối hợp lý phết.'],
    ['demo2', 'Có ai chơi cờ vua không, mình đang tập lại.'],
    ['demo1', 'Mình mới học khai cuộc Ý, thua liên tọi.'],
    ['demo2', 'Khai cuộc nào cũng được, quan trọng là nhớ lại sau ván.', 8],
    ['owner', 'Mèo nhà mình vừa đánh rơi cốc nước, xin phép than thở.'],
    ['demo1', 'Một chiếc cốc đổi lấy một buổi chiều yên tĩnh, đáng.'],
    ['demo2', 'Ngày mai mình thử làm bánh, có gì sẽ khoe sau.'],
  ],
  dev: [
    ['owner', 'Kênh này để bàn code. Ai đang làm gì thì kể nghe.'],
    ['demo1', 'Mình đang đọc lại phần cache của TanStack Query, vẫn thấy vài chỗ chưa rõ.'],
    ['demo2', 'staleTime khác gcTime ở chỗ nào ấy nhỉ?', 2],
    [
      'demo1',
      'staleTime là thời gian dữ liệu còn được coi là mới; gcTime là thời gian giữ cache khi không còn ai dùng.',
      3,
    ],
    ['demo2', 'Cảm ơn, giờ mình hiểu rồi. Mình đang chỉnh lại chỗ refetch khi focus tab.'],
    ['owner', 'Nhớ kiểm tra số lần request, bật focus refetch dễ tăng tải.'],
    ['demo1', 'Log đúng là có thêm request khi quay lại tab.'],
    ['demo2', 'Thế thì đặt staleTime dài hơn cho query ít đổi, đừng tắt hẳn.'],
    ['demo1', 'Mình vừa thêm test cho trường hợp mất mạng rồi bật lại, chạy ổn.'],
    ['owner', 'Tốt, để mình review rồi merge.'],
  ],
};

const REACTIONS = [
  { channel: 'general', index: 0, emoji: '👍', actor: 'demo1' },
  { channel: 'general', index: 0, emoji: '👍', actor: 'demo2' },
  { channel: 'general', index: 3, emoji: '🎉', actor: 'demo1' },
  { channel: 'general', index: 15, emoji: '🔥', actor: 'demo2' },
  { channel: 'random', index: 1, emoji: '❤️', actor: 'demo2' },
  { channel: 'dev', index: 9, emoji: '🎉', actor: 'demo1' },
];
const PIN = { channel: 'general', index: 3 };

async function main() {
  console.log(`▶ Seed demo tại ${BASE}`);

  const owner = await ensureAccount(OWNER, 'owner-demo');
  const demo1 = await ensureAccount(DEMO1, 'demo1');
  const demo2 = await ensureAccount(DEMO2, 'demo2');

  const servers = await api('/servers', { token: owner.token });
  let server = servers.find((item) => item.name === SERVER_NAME);
  let serverCreated = false;
  if (server) {
    console.log(`• Server "${SERVER_NAME}" đã có, dùng lại`);
  } else {
    const created = await api('/servers', {
      method: 'POST',
      token: owner.token,
      body: { name: SERVER_NAME },
    });
    server = created;
    serverCreated = true;
    console.log(`• Đã tạo server "${SERVER_NAME}"`);
  }

  let detail = await api(`/servers/${server.id}`, { token: owner.token });
  const channelIds = {};
  for (const name of CHANNELS) {
    const existing = detail.channels.find((channel) => channel.name === name);
    if (existing) {
      channelIds[name] = existing.id;
      continue;
    }
    const created = await api(`/servers/${server.id}/channels`, {
      method: 'POST',
      token: owner.token,
      body: { name },
    });
    channelIds[name] = created.id;
    console.log(`• Đã tạo kênh #${name}`);
  }

  async function ensureMember(account, label) {
    const list = await api('/servers', { token: account.token });
    if (list.some((item) => item.id === server.id)) {
      console.log(`• ${label} đã ở trong server`);
      return;
    }
    await api('/servers/join', {
      method: 'POST',
      token: account.token,
      body: { inviteCode: detail.inviteCode },
    });
    console.log(`• ${label} đã tham gia server`);
  }
  await ensureMember(demo1, 'demo1');
  await ensureMember(demo2, 'demo2');

  const tokens = { owner: owner.token, demo1: demo1.token, demo2: demo2.token };
  let created = 0;
  let reused = 0;
  const messageIds = {};
  const demo1MessageIds = [];

  for (const name of CHANNELS) {
    const page = await api(`/channels/${channelIds[name]}/messages?limit=100`, {
      token: owner.token,
    });
    const known = new Map(page.messages.filter((m) => m.nonce).map((m) => [m.nonce, m.id]));
    messageIds[name] = [];
    for (const [order, [author, text, replyTo]] of CONTENT[name].entries()) {
      const nonce = stableUuid(`ping-demo:${name}:${order + 1}`);
      const body = { content: text, nonce };
      if (replyTo) body.replyToId = messageIds[name][replyTo - 1];
      const message = await api(`/channels/${channelIds[name]}/messages`, {
        method: 'POST',
        token: tokens[author],
        body,
      });
      messageIds[name].push(message.id);
      if (known.has(nonce)) reused++;
      else created++;
      if (author === 'demo1') demo1MessageIds.push(message.id);
      await sleep(SEND_GAP_MS);
    }
  }

  for (const reaction of REACTIONS) {
    await api(
      `/messages/${messageIds[reaction.channel][reaction.index]}/reactions/${encodeURIComponent(reaction.emoji)}`,
      { method: 'PUT', token: tokens[reaction.actor] },
    );
  }
  console.log(`• Reaction: ${REACTIONS.length} lượt`);

  await api(`/messages/${messageIds[PIN.channel][PIN.index]}/pin`, {
    method: 'PUT',
    token: owner.token,
  });
  console.log('• Đã ghim tin luật server');

  const dm = await api('/dms', {
    method: 'POST',
    token: demo1.token,
    body: { userId: demo2.user.id },
  });
  await api(`/channels/${dm.channelId}/messages`, {
    method: 'POST',
    token: demo1.token,
    body: {
      content: 'Chào demo2, đây là tin nhắn riêng đầu tiên. Mai mình thử gọi thoại nhé.',
      nonce: stableUuid('ping-demo:dm:1'),
    },
  });
  console.log('• demo1 đã nhắn DM cho demo2');

  const visible = await api('/servers', { token: demo1.token });
  const seesServer = visible.some((item) => item.id === server.id);
  if (!seesServer) stop('demo1 không thấy server demo trong danh sách');
  if (demo1MessageIds.length === 0) stop('demo1 chưa gửi được tin nào');

  let auditStatus = 0;
  try {
    await api(`/servers/${server.id}/audit-log`, { token: demo1.token });
  } catch (error) {
    auditStatus = error.status;
  }
  if (auditStatus !== 403) stop(`audit-log của demo1 phải 403, nhận ${auditStatus || '200'}`);

  console.log(`
✔ Xong
  server    ${server.name} (${serverCreated ? 'mới tạo' : 'dùng lại'}) — ${server.id}
  kênh      ${CHANNELS.join(', ')}
  tin nhắn  ${created} mới, ${reused} có sẵn
  demo1     thấy server và đã gửi ${demo1MessageIds.length} tin
  quyền     GET /audit-log bằng demo1 → 403 (không có mục Quản trị)
  DM        ${dm.channelId}
`);
}

main().catch((error) => {
  console.error(`\n✖ ${error.message}`);
  if (error.cause) console.error(`  cause: ${error.cause.code ?? ''} ${error.cause.message ?? ''}`);
  if (error.code) console.error(`  code: ${error.code}`);
  if (error.requestId) console.error(`  requestId: ${error.requestId}`);
  process.exit(1);
});
