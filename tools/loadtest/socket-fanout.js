// Kịch bản 2 (hướng dẫn 16.3): N client nối socket và join channel; một phần gửi tin với tốc độ cố định
// qua REST, phần còn lại chỉ nghe. Đo độ trễ từ lúc GỬI đến lúc client NHẬN, tách riêng trường hợp người
// nhận ở instance KHÁC người gửi (đi qua Redis adapter).
//   k6 run tools/loadtest/socket-fanout.js -e PORTS=4001,4002,4003 -e LISTENERS=1000 -e SEND_RATE=50 -e DURATION=60s
// Mục tiêu: phát liên instance p95 < 500 ms; 5xx < 0,1%. Cùng một máy nên đồng hồ gửi/nhận là một.
import http from 'k6/http';
import { check } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { SharedArray } from 'k6/data';
import { connect } from './lib/socketio.js';

const tokens = new SharedArray('tokens', () => JSON.parse(open('./data/tokens.json')));
const meta = JSON.parse(open('./data/meta.json'));
const PORTS = (__ENV.PORTS || '4001').split(',');
const LISTENERS = Number(__ENV.LISTENERS || 1000);
const SEND_RATE = Number(__ENV.SEND_RATE || 50);
const SENDERS = Number(__ENV.SENDERS || 500);
const DURATION = __ENV.DURATION || '60s';
// Listener giữ socket đến khi người gửi xong (startTime 20s + DURATION) cộng 10s chờ tin cuối.
const holdMs = (20 + Number(DURATION.replace(/s$/, '')) + 10) * 1000;

const delivery = new Trend('delivery_latency_ms', true);
const connectMs = new Trend('socket_connect_ms', true);
const received = new Counter('messages_received');
const joinFailed = new Counter('join_failed');
const socketErrors = new Counter('socket_errors');
const sendFailed = new Counter('send_failed');

export const options = {
  scenarios: {
    listeners: {
      executor: 'per-vu-iterations',
      vus: LISTENERS,
      iterations: 1,
      maxDuration: `${Math.ceil(holdMs / 1000) + 60}s`,
      exec: 'listen',
    },
    senders: {
      executor: 'constant-arrival-rate',
      rate: SEND_RATE,
      timeUnit: '1s',
      duration: DURATION,
      startTime: '20s', // sau khi các listener đã nối và join
      preAllocatedVUs: 50,
      maxVUs: 500,
      exec: 'send',
    },
  },
  thresholds: {
    'delivery_latency_ms{cross:true}': ['p(95)<500'],
    'delivery_latency_ms{cross:false}': ['p(95)<500'],
    'http_req_duration{kind:send}': ['p(95)<200'],
    send_failed: ['count<1'],
    join_failed: ['count<1'],
  },
};

const xff = (i) => `10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}`;

export function listen() {
  const index = (__VU - 1) % LISTENERS;
  const port = PORTS[index % PORTS.length];
  const channelId = meta.channels[index % meta.channels.length].id;
  const startedAt = Date.now();
  const client = connect(`http://127.0.0.1:${port}`, tokens[index].token, xff(index), {
    onOpen(socket) {
      connectMs.add(Date.now() - startedAt);
      socket.emit('channel.join', { channelId }, (result) => {
        if (!result || !result.ok) joinFailed.add(1);
      });
    },
    onEvent(name, payload) {
      if (name !== 'message.created' || !payload.content.startsWith('LT|')) return;
      const [, sentAt, senderPort] = payload.content.split('|');
      delivery.add(Date.now() - Number(sentAt), { cross: String(senderPort !== port) });
      received.add(1);
    },
    onError() {
      socketErrors.add(1);
    },
  });
  setTimeout(() => client.close(), holdMs);
}

export function send() {
  // Người gửi lấy từ cuối danh sách để không trùng với listener (đầu danh sách).
  const index = tokens.length - 1 - Math.floor(Math.random() * SENDERS);
  const port = PORTS[Math.floor(Math.random() * PORTS.length)];
  const channelId = meta.channels[Math.floor(Math.random() * meta.channels.length)].id;
  const response = http.post(
    `http://127.0.0.1:${port}/api/v1/channels/${channelId}/messages`,
    JSON.stringify({
      content: `LT|${Date.now()}|${port}|${Math.random().toString(36).slice(2, 8)}`,
      nonce: crypto.randomUUID(),
    }),
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${tokens[index].token}`,
        'X-Forwarded-For': xff(index),
      },
      tags: { kind: 'send' },
    },
  );
  if (!check(response, { 'sent 201': (r) => r.status === 201 })) sendFailed.add(1);
}
