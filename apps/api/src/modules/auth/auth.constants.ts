/** Tên cookie chứa refresh token — httpOnly nên JS phía client không đọc được. */
export const REFRESH_COOKIE_NAME = 'ping_refresh';

/** Access token sống 15 phút (guide 9.1) — client giữ trong bộ nhớ RAM, không qua cookie. */
export const ACCESS_TOKEN_TTL = '15m';

/** Refresh token sống 30 ngày — giá trị tính bằng ms vì cookie.maxAge nhận ms. */
export const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Path giới hạn cookie ở nhóm auth — chỉ refresh/logout cần gửi kèm, tin nhắn không cần. */
export const REFRESH_COOKIE_PATH = '/api/v1/auth';

/**
 * Token vừa bị xoay vòng trong khoảng này mà xuất hiện lại = hai request refresh đồng thời
 * (hai tab), không phải bị đánh cắp: trả 401 nhưng KHÔNG revoke mọi session.
 */
export const REFRESH_REUSE_GRACE_MS = 10_000;
