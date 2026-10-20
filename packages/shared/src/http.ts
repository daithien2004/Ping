/**
 * Header tùy chỉnh BẮT BUỘC cho endpoint dùng cookie (refresh, logout) — chống CSRF (ADR-0027).
 * Trình duyệt không tự gắn header này vào request chéo site, và gắn thủ công thì phải qua preflight
 * CORS (API chỉ cho phép WEB_ORIGIN). API đồng thời kiểm tra `Origin`.
 */
export const CLIENT_HEADER = 'X-Ping-Client';
export const CLIENT_HEADER_VALUE = 'web';
