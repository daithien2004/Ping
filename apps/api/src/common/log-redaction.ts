/**
 * Đường dẫn pino che trong access log (quy tắc 11). `res.headers["set-cookie"]` quan trọng:
 * login/register/refresh trả refresh token qua Set-Cookie, access log của pino-http ghi header
 * response nên nếu không che thì token nằm trong log (known-issues O2, đã sửa).
 */
export const LOG_REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
];
