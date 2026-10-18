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
  },
});
