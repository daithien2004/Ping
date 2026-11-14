export const REFRESH_COOKIE_NAME = 'ping_refresh';

export const ACCESS_TOKEN_TTL = '15m';

export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const REFRESH_COOKIE_PATH = '/api/v1/auth';

// Token vừa xoay vòng xuất hiện lại trong khoảng này = hai refresh đồng thời (hai tab): 401 nhưng KHÔNG revoke mọi session.
export const REFRESH_REUSE_GRACE_MS = 10_000;
