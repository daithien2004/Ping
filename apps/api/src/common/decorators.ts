import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_FAIL_CLOSED = 'rateLimitFailClosed';

/**
 * Endpoint mà rate limit KHÔNG được bỏ qua khi Redis chết (đăng nhập, đăng ký, refresh): trả 503
 * thay vì cho đi tiếp không giới hạn (ADR-0026). Endpoint khác mặc định fail-open.
 */
export const RateLimitFailClosed = () => SetMetadata(RATE_LIMIT_FAIL_CLOSED, true);
