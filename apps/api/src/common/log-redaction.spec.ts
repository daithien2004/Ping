import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { pinoHttp } from 'pino-http';
import { afterAll, describe, expect, it } from 'vitest';
import { LOG_REDACT_PATHS } from './log-redaction.js';

/** Chạy pino-http THẬT trước một server Node thật: kiểm đúng thứ nó ghi ra log (quy tắc 11). */
describe('access log redaction', () => {
  const lines: string[] = [];
  const logger = pinoHttp(
    { redact: LOG_REDACT_PATHS },
    { write: (line: string) => lines.push(line) },
  );
  const server = http.createServer((req, res) => {
    logger(req, res);
    // Giống login/register/refresh: response đặt cookie refresh token.
    res.setHeader('Set-Cookie', 'ping_refresh=FAKE_REFRESH_TOKEN; HttpOnly; Path=/api/v1/auth');
    res.end('ok');
  });
  afterAll(() => new Promise((resolve) => server.close(resolve)));

  it('never writes tokens or cookies to the log (request or response side)', async () => {
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const { port } = server.address() as AddressInfo;
    await fetch(`http://127.0.0.1:${port}/login`, {
      method: 'POST',
      headers: { authorization: 'Bearer FAKE_ACCESS_TOKEN', cookie: 'ping_refresh=FAKE_COOKIE' },
    });
    await new Promise((resolve) => setTimeout(resolve, 50)); // pino-http ghi khi response 'finish'

    const log = lines.join('\n');
    expect(log).toContain('"statusCode":200'); // có ghi log thật, không phải test rỗng
    expect(log).not.toContain('FAKE_ACCESS_TOKEN');
    expect(log).not.toContain('FAKE_COOKIE');
    expect(log).not.toContain('FAKE_REFRESH_TOKEN');
  });
});
