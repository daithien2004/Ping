import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_FAIL_CLOSED = 'rateLimitFailClosed';

/**
 * Endpoint mà rate limit KHÔNG được bỏ qua khi Redis chết (đăng nhập, đăng ký, refresh): trả 503
 * thay vì cho đi tiếp không giới hạn (ADR-0026). Endpoint khác mặc định fail-open.
 */
export const RateLimitFailClosed = () => SetMetadata(RATE_LIMIT_FAIL_CLOSED, true);

export const RATE_LIMIT_BY_IP = 'rateLimitByIp';

/**
 * Bucket phải khoá theo IP kể cả khi request mang access token (ADR-0080).
 *
 * Dùng cho `/attachments/:id/file` (không có header Authorization, tải bởi thẻ `<img>`) và
 * `/attachments/:id/download`: khoá theo IP để một người không xoay token mà nhân hạn mức đọc
 * byte tệp. Cũng áp cho `AuthController` (login/register/refresh/logout): người gọi không có token
 * thật, khoá theo IP mới chặn được dò mật khẩu từ một máy.
 */
export const RateLimitByIp = () => SetMetadata(RATE_LIMIT_BY_IP, true);
