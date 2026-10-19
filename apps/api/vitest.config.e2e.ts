import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Các spec dùng chung một Postgres + Redis thật (rate limit, unique email).
    // Chạy tuần tự để kết quả tất định thay vì đua nhau trên cửa sổ 60s.
    fileParallelism: false,
    // Spec gọi flushdb() để reset rate limit/cache: dùng Redis DB riêng (số 1) để không xóa
    // dữ liệu dev ở DB 0. process.env thắng giá trị trong .env khi ConfigModule nạp cấu hình.
    env: { REDIS_URL: process.env.E2E_REDIS_URL ?? 'redis://localhost:6379/1' },
  },
});
