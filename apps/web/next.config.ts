import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Chỉ có ở dev. Mặc định góc dưới-trái đè lên nút đăng xuất của server rail; dưới-phải đè ô soạn tin.
  devIndicators: { position: 'top-right' },
  experimental: {
    // Chỉ kiểm tra "instant navigation" ở segment tự khai báo `instant`. Mặc định Next kiểm tra
    // MỌI page, nhưng khu vực đăng nhập của ping cố ý chỉ render trong trình duyệt
    // (`use(browser())`, ADR-0017/0018) nên không thể render để kiểm tra trên server.
    instantInsights: { validationLevel: 'manual-warning' },
  },
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;
