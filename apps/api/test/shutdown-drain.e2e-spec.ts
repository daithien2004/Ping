import type { AddressInfo } from 'node:net';
import net from 'node:net';
import { describe, expect, it } from 'vitest';
import { bootApp } from './helpers/boot.js';

/**
 * SIGTERM (ADR-0026) mô phỏng bằng `(app as unknown as { close(signal?: string): Promise<void> }).close('SIGTERM')`: đúng đường mà Nest chạy khi nhận tín hiệu
 * thật (Windows không gửi được SIGTERM tới process con nên không dùng tín hiệu thật ở đây).
 */
describe('graceful shutdown (e2e)', () => {
  it('drains: /ready turns 503, the in-flight request still completes, then close resolves', async () => {
    const app = await bootApp({ shutdown: { graceMs: 600, timeoutMs: 20_000 } });
    await app.listen(0);
    const { port } = app.getHttpServer().address() as AddressInfo;

    // Request "đang chạy" thật: gửi header + nửa thân, server đang chờ nốt phần còn lại.
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
    // INestApplication.close() khai báo không tham số, nhưng lớp thật nhận tên tín hiệu.
    const closeWithSignal = app.close.bind(app) as (signal: string) => Promise<void>;
    const closing = closeWithSignal('SIGTERM').then(() => {
      closed = true;
    });

    // Đang trong thời gian chờ (grace): server vẫn nhận kết nối mới và báo "đang tắt".
    const ready = await fetch(`http://127.0.0.1:${port}/api/v1/ready`);
    expect(ready.status).toBe(503);
    // Terminus cũng tự trả 503 khi app đang tắt; message "Shutting down" chứng minh cờ drain của
    // ShutdownService (chủ động, kèm thời gian chờ) là thứ trả lời.
    expect(await ready.json()).toMatchObject({
      code: 'SERVICE_UNAVAILABLE',
      message: 'Shutting down',
    });
    expect((await fetch(`http://127.0.0.1:${port}/api/v1/health`)).status).toBe(200);

    // Quá thời gian chờ, server đóng cửa nhưng KHÔNG cắt request đang chạy: close chưa xong.
    await new Promise((resolve) => setTimeout(resolve, 900));
    expect(closed).toBe(false);

    socket.write(body.slice(10)); // hoàn tất request dở
    await ended;
    expect(raw).toMatch(/^HTTP\/1\.1 (200|401)/); // xử lý bình thường, không 5xx, không bị ngắt
    await closing;
    expect(closed).toBe(true);
  });
});
