/** Tên cookie chứa refresh token — httpOnly nên JS phía client không đọc được. */
export const REFRESH_COOKIE_NAME = 'ping_refresh';

/** Access token sống 15 phút (guide 9.1) — client giữ trong bộ nhớ RAM, không qua cookie. */
export const ACCESS_TOKEN_TTL = '15m';

/** Refresh token sống 30 ngày — giá trị tính bằng ms vì cookie.maxAge nhận ms. */
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Path giới hạn cookie ở nhóm auth — chỉ refresh/logout cần gửi kèm, tin nhắn không cần. */
export const REFRESH_COOKIE_PATH = '/api/v1/auth';
