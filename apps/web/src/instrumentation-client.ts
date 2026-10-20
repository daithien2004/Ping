// Chạy trong trình duyệt TRƯỚC mọi code ứng dụng (Next: instrumentation-client). Tắt JIT của zod
// trước khi bất kỳ module nào tạo schema đầu tiên (xem lib/zod-jitless.ts, ADR-0027).
import './lib/zod-jitless';
