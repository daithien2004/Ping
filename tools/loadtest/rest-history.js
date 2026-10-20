// Kịch bản 1 (hướng dẫn 16.3): đọc lịch sử tin nhắn và danh sách thành viên qua REST.
//   k6 run tools/loadtest/rest-history.js -e PORTS=4001,4002 -e RATE=200 -e DURATION=60s
// Mỗi vòng: trang đầu của một channel (70% là channel nóng), rồi đi sâu 4 trang bằng cursor `before`;
// 25% vòng có thêm một trang thành viên. Mục tiêu: p95 < 200 ms, lỗi < 0,1%.
import http from 'k6/http';
import { check } from 'k6';
import { SharedArray } from 'k6/data';

const tokens = new SharedArray('tokens', () => JSON.parse(open('./data/tokens.json')));
const meta = JSON.parse(open('./data/meta.json'));
const PORTS = (__ENV.PORTS || '4001').split(',');

export const options = {
  scenarios: {
    // Khởi động nóng trước khi đo (JIT, pool kết nối, cache quyền): không có bước này, vài giây đầu làm p95 xấu giả tạo.
    warmup: {
      executor: 'constant-arrival-rate',
      rate: 20,
      timeUnit: '1s',
      duration: '10s',
      preAllocatedVUs: 20,
      maxVUs: 100,
      env: { PHASE: 'warmup' },
    },
    history: {
      startTime: '12s',
      env: { PHASE: 'main' },
      executor: 'constant-arrival-rate',
      rate: Number(__ENV.RATE || 200), // vòng mỗi giây (mỗi vòng 5–6 request)
      timeUnit: '1s',
      duration: __ENV.DURATION || '60s',
      preAllocatedVUs: 200,
      maxVUs: 2000,
    },
  },
  thresholds: {
    'http_req_duration{kind:first_page}': ['p(95)<200'],
    'http_req_duration{kind:deep_page}': ['p(95)<200'],
    'http_req_duration{kind:members}': ['p(95)<200'],
    http_req_failed: ['rate<0.001'],
  },
};

const xff = (i) => `10.${(i >> 16) & 255}.${(i >> 8) & 255}.${i & 255}`;

export default function () {
  const i = Math.floor(Math.random() * tokens.length);
  const base = `http://127.0.0.1:${PORTS[i % PORTS.length]}/api/v1`;
  const params = (kind) => ({
    headers: { Authorization: `Bearer ${tokens[i].token}`, 'X-Forwarded-For': xff(i) },
    // Vòng khởi động gắn nhãn riêng để không lọt vào ngưỡng và số liệu.
    tags: { kind: __ENV.PHASE === 'warmup' ? `warmup_${kind}` : kind },
  });
  const channel =
    Math.random() < 0.7
      ? meta.hotChannelId
      : meta.channels[Math.floor(Math.random() * meta.channels.length)].id;

  let page = http.get(`${base}/channels/${channel}/messages`, params('first_page'));
  check(page, { 'first page 200': (r) => r.status === 200 });
  for (let depth = 0; depth < 4 && page.status === 200; depth++) {
    const body = page.json();
    if (!body.hasMore) break;
    const cursor = body.messages[body.messages.length - 1].id;
    page = http.get(`${base}/channels/${channel}/messages?before=${cursor}`, params('deep_page'));
    check(page, { 'deep page 200': (r) => r.status === 200 });
  }
  if (Math.random() < 0.25) {
    const members = http.get(
      `${base}/servers/${meta.serverId}/members?limit=50`,
      params('members'),
    );
    check(members, { 'members 200': (r) => r.status === 200 });
  }
}
