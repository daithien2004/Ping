import type { AddressInfo } from 'node:net';
import net from 'node:net';
import { describe, expect, it } from 'vitest';
import { bootApp } from './helpers/boot.js';

/** Mô phỏng SIGTERM bằng close(SIGTERM): Windows không gửi được SIGTERM tới process con. */
describe('graceful shutdown (e2e)', () => {
  it('drains: /ready turns 503, the in-flight request still completes, then close resolves', async () => {
    const app = await bootApp({ shutdown: { graceMs: 600, timeoutMs: 20_000 } });
    await app.listen(0);
    const { port } = app.getHttpServer().address() as AddressInfo;

    const body = JSON.stringify({ email: 'nobody@ping.dev', password: 'password123' });
    const socket = net.connect(port, '127.0.0.1');
    let raw = '';
    socket.on('data', (chunk) => (raw += chunk.toString()));
    const ended = new Promise<void>((resolve) => socket.on('close', () => resolve()));
    socket.write(
      `POST /api/v1/auth/login HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\n` +
        `Content-Length: ${body.length}\r\nConnection: close\r\n\r\n${body.slice(0, 10)}`,
    );
    await new Promise((resolve) => setTimeout(resolve, 100));

    let closed = false;
    const closeWithSignal = app.close.bind(app) as (signal: string) => Promise<void>;
    const closing = closeWithSignal('SIGTERM').then(() => {
      closed = true;
    });

    const ready = await fetch(`http://127.0.0.1:${port}/api/v1/ready`);
    expect(ready.status).toBe(503);
    // Terminus cũng tự trả 503 khi tắt; message "Shutting down" chứng minh cờ drain của ShutdownService.
    expect(await ready.json()).toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      message: 'Shutting down',
    });
    expect((await fetch(`http://127.0.0.1:${port}/api/v1/health`)).status).toBe(200);

    await new Promise((resolve) => setTimeout(resolve, 900));
    expect(closed).toBe(false);

    socket.write(body.slice(10));
    await ended;
    expect(raw).toMatch(/^HTTP\/1\.1 (200|401)/);
    await closing;
    expect(closed).toBe(true);
  });
});
