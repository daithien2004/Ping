import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_FAIL_CLOSED = 'rateLimitFailClosed';

// Rate limit fail-closed: Redis chết → 503 thay vì cho đi không giới hạn.
export const RateLimitFailClosed = () => SetMetadata(RATE_LIMIT_FAIL_CLOSED, true);

export const RATE_LIMIT_BY_IP = 'rateLimitByIp';

// Khoá theo IP kể cả khi có access token: /auth/* và /attachments/:id/file (link ký, không có Authorization) chưa có token thật.
export const RateLimitByIp = () => SetMetadata(RATE_LIMIT_BY_IP, true);
