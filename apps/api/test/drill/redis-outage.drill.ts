/**
 * DRILL (diễn tập thật), không phải test tự động: tắt Redis THẬT bằng docker compose rồi xem một
 * API đã build xử lý ra sao (ADR-0026, docs/runbook/failure-modes.md).
 *
 *   docker compose up -d
 *   pnpm --filter api build
 *   pnpm --filter api drill:redis
 *
 * Script tự chạy API ở cổng 4100 (Redis DB 2, không đụng dữ liệu dev ở DB 0) nên không cần bật dev
 * server. Nó DỪNG container redis của docker compose trong vài giây: mọi thứ khác đang dùng Redis
 * trên máy (dev server, e2e) sẽ bị suy giảm tạm thời. Không chạy trong `test:e2e` vì lý do đó.
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

  const { email, token, channelId, send } = await seedChat();
  record('Gửi tin khi Redis khỏe', (await send('trước sự cố')).status === 201);

  console.log('\n>>> docker compose stop redis');
  compose('stop', 'redis');
  try {
    const degraded = await waitFor(
      '/ready = degraded',
      async () => (await call('GET', '/ready')).body.status === 'degraded',
      15_000,
    );
    record('/ready báo "degraded" khi Redis chết', degraded);
    record(
      '/ready vẫn 200 (instance ở lại pool, REST còn chạy)',
      (await call('GET', '/ready')).status === 200,
    );

    const sent = await send('trong sự cố');
    record('Gửi tin khi Redis chết → 201', sent.status === 201, `${sent.ms}ms`);
    record('...không chờ hết timeout từng lệnh Redis', sent.ms < 1500, `${sent.ms}ms`);

    const list = await call('GET', `/channels/${channelId}/messages`, { token });
    const texts =
      (list.body.messages as Array<{ content: string }> | undefined)?.map((m) => m.content) ?? [];
    record(
      'Đọc lịch sử vẫn được, thấy tin vừa gửi',
      list.status === 200 && texts.includes('trong sự cố'),
    );

    const login = await call('POST', '/auth/login', { body: { email, password: 'password123' } });
    record(
      'Đăng nhập bị từ chối 503 SERVICE_UNAVAILABLE kèm requestId (fail-closed)',
      login.status === 503 &&
        login.body.code === 'SERVICE_UNAVAILABLE' &&
        Boolean(login.body.requestId),
    );
    record(
      'Tiến trình API vẫn sống, không crash/unhandled',
      !api.exited() && !/unhandled/i.test(api.logs()),
    );
  } finally {
    console.log('\n>>> docker compose start redis');
    compose('start', 'redis');
  }

  const recovered = await waitFor(
    '/ready = ok',
    async () => (await call('GET', '/ready')).body.status === 'ok',
    30_000,
  );
  record('Redis về lại → /ready trở lại "ok" không cần restart API', recovered);
  const login = await call('POST', '/auth/login', { body: { email, password: 'password123' } });
  record('Đăng nhập hoạt động lại', login.status === 200);
  record('Gửi tin sau khi phục hồi', (await send('sau sự cố')).status === 201);
} catch (error) {
  record('Drill chạy hết', false, (error as Error).message);
  try {
    compose('start', 'redis'); // đừng để Redis đang tắt
  } catch {
    // best effort
  }
} finally {
  api.child.kill();
}
finish();
