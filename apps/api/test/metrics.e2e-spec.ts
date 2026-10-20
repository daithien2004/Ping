import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MetricsService } from '../src/infra/metrics/metrics.service.js';
import { RedisProvider } from '../src/infra/redis/redis.module.js';
import { bootApp } from './helpers/boot.js';

// H5 (ADR-0031): GET /metrics ở cổng RIÊNG, nhãn route theo mẫu (không theo URL thật), số kết nối
// socket, và trạng thái Postgres/Redis lấy lúc scrape.
async function scrape(app: INestApplication, port: number): Promise<string> {
  void app;
  const res = await fetch(`http://127.0.0.1:${port}/metrics`);
  expect(res.status).toBe(200);
  return res.text();
}

const line = (text: string, prefix: string) => text.split('\n').find((l) => l.startsWith(prefix));

describe('metrics (e2e)', () => {
  let app: INestApplication;
  let port: number;
  let wsPort: number;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    app = await bootApp({ websocket: true });
    const address = app.getHttpServer().address();
    wsPort = typeof address === 'object' && address !== null ? address.port : 0;
    port = await app.get(MetricsService).listen(0);
  }, 30000);

  afterAll(async () => {
    for (const socket of sockets) socket.disconnect();
    await app.close();
  });

  it('is not served on the public port', async () => {
    await request(app.getHttpServer()).get('/metrics').expect(404);
    await request(app.getHttpServer()).get('/api/v1/metrics').expect(404);
  });

  it('counts requests by route TEMPLATE and status class', async () => {
    await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    await request(app.getHttpServer()).get(`/api/v1/servers/${randomUUID()}`).expect(401);
    await request(app.getHttpServer()).get(`/api/v1/servers/${randomUUID()}`).expect(401);
    await request(app.getHttpServer()).get(`/api/v1/no-such-${randomUUID()}`).expect(404);

    const text = await scrape(app, port);
    expect(
      line(
        text,
        'http_request_duration_seconds_count{method="GET",route="/api/v1/health",status_class="2xx"}',
      ),
    ).toMatch(/ 1$/);
    expect(
      line(
        text,
        'http_request_duration_seconds_count{method="GET",route="/api/v1/servers/:serverId",status_class="4xx"}',
      ),
    ).toMatch(/ 2$/);
    expect(text).toContain('route="unmatched"');
    expect(text).not.toMatch(/route="[^"]*[0-9a-f]{8}-[0-9a-f]{4}-/); // không URL thật trong nhãn
  });

  it('reports open websocket connections and goes back to 0', async () => {
    const register = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email: `met-${randomUUID().slice(0, 8)}@ping.dev`,
        username: `met_${randomUUID().slice(0, 8)}`,
        password: 'password123',
      });
    expect(register.status).toBe(201);
    const socket = io(`http://127.0.0.1:${wsPort}`, {
      transports: ['websocket'],
      auth: { token: register.body.accessToken },
      reconnection: false,
    });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('connect_error', reject);
    });
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(line(await scrape(app, port), 'ws_connections ')).toBe('ws_connections 1');

    socket.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 300));
    const text = await scrape(app, port);
    expect(line(text, 'ws_connections ')).toBe('ws_connections 0');
    expect(line(text, 'ws_disconnects_total ')).toBe('ws_disconnects_total 1');
  });

  it('reports postgres and redis as up', async () => {
    const text = await scrape(app, port);
    expect(line(text, 'dependency_up{name="postgres"}')).toMatch(/ 1$/);
    expect(line(text, 'dependency_up{name="redis"}')).toMatch(/ 1$/);
    expect(text).toContain('nodejs_eventloop_lag_seconds'); // metrics mặc định của Node
  });
});

describe('metrics with Redis down (e2e)', () => {
  it('shows dependency_up{redis} = 0 and still answers', async () => {
    const app = await bootApp({ deadRedis: true });
    try {
      expect(app.get(RedisProvider).isUp).toBe(false);
      const port = await app.get(MetricsService).listen(0);
      const text = await scrape(app, port);
      expect(line(text, 'dependency_up{name="redis"}')).toMatch(/ 0$/);
      expect(line(text, 'dependency_up{name="postgres"}')).toMatch(/ 1$/);
    } finally {
      await app.close();
    }
  });
});
