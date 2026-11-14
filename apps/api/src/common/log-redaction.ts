// res.headers['set-cookie']: refresh token đi qua Set-Cookie, không che thì token nằm trong access log.
export const LOG_REDACT_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'res.headers["set-cookie"]',
];
