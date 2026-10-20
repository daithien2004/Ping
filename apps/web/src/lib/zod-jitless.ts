import { config } from 'zod/v4/core';

/**
 * Tắt JIT của zod 4 TRƯỚC khi schema đầu tiên được tạo (ADR-0027). Mặc định zod dò khả năng biên
 * dịch bằng `new Function('')` ngay lúc tạo schema đầu tiên; CSP của web không có 'unsafe-eval' nên
 * mỗi lần dò là một vi phạm CSP (bị bắt trong try/catch, nhưng vẫn là báo cáo vi phạm). Cấu hình chỉ
 * có tác dụng nếu chạy trước mọi schema, nên chỉ import `zod/v4/core` và được nạp từ
 * `instrumentation-client.ts`. Validation form chậm đi không đáng kể.
 */
config({ jitless: true });
