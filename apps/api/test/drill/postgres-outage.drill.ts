/**
 * DRILL (diễn tập thật): tắt Postgres THẬT bằng docker compose (ADR-0026). Chạy như redis-outage:
 *
 *   docker compose up -d && pnpm --filter api build && pnpm --filter api drill:postgres
 *
 * Dừng container postgres vài giây: dev server và e2e đang chạy sẽ lỗi tạm thời.
 */
import { call, compose, finish, record, seedChat, startApi, waitFor } from './lib.js';

const api = startApi();
try {
  const up = await waitFor(
    'API khởi động',
    async () => (await call('GET', '/ready')).body.status === 'ok',
    30_000,
  );
  record('API chạy, /ready = ok', up);
  if (!up) finish();

  const { token, channelId, send } = await seedChat();
  record('Gửi tin khi Postgres khỏe', (await send('trước sự cố')).status === 201);

  console.log('\n>>> docker compose stop postgres');
  compose('stop', 'postgres');
  try {
    await waitFor(
      'Postgres tắt hẳn',
      async () => (await call('GET', '/ready')).status === 503,
      15_000,
    );
    const ready = await call('GET', '/ready');
    record('/ready trả 503: load balancer loại instance', ready.status === 503);
    record(
      '/health (liveness) vẫn 200: không bị restart vô ích',
      (await call('GET', '/health')).status === 200,
    );

    const read = await call('GET', `/channels/${channelId}/messages`, { token });
    record(
      'Request cần DB → 503 SERVICE_UNAVAILABLE kèm requestId (không phải 500)',
      read.status === 503 &&
        read.body.code === 'SERVICE_UNAVAILABLE' &&
        Boolean(read.body.requestId),
      `${read.status} trong ${read.ms}ms`,
    );
    record('...trả lời nhanh, không treo', read.ms < 6_000, `${read.ms}ms`);
    record(
      'Tiến trình API vẫn sống, không crash/unhandled',
      !api.exited() && !/unhandled/i.test(api.logs()),
    );
  } finally {
    console.log('\n>>> docker compose start postgres');
    compose('start', 'postgres');
  }

  const recovered = await waitFor(
    '/ready = ok',
    async () => (await call('GET', '/ready')).body.status === 'ok',
    60_000,
  );
  record('Postgres về lại → /ready trở lại "ok" không cần restart API', recovered);
  const read = await call('GET', `/channels/${channelId}/messages`, { token });
  record('Đọc lịch sử hoạt động lại', read.status === 200);
  record('Gửi tin sau khi phục hồi', (await send('sau sự cố')).status === 201);
} catch (error) {
  record('Drill chạy hết', false, (error as Error).message);
  try {
    compose('start', 'postgres');
  } catch {
    // best effort
  }
} finally {
  api.child.kill();
}
finish();
