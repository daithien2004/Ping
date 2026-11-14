/** Dừng container redis vài giây: dev server và e2e đang chạy sẽ suy giảm tạm thời; không chạy trong `test:e2e`. */
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
    compose('start', 'redis');
  } catch {
    // Dọn dẹp tốt nhất có thể: container có thể đã chạy lại.
  }
} finally {
  api.child.kill();
}
finish();
