import type { NextConfig } from 'next';

const isProduction = process.env.NODE_ENV === 'production';
// Cùng mặc định với src/lib/env.ts. REST và Socket.IO dùng chung origin này (http→ws, https→wss).
const apiOrigin = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const wsOrigin = apiOrigin.replace(/^http/, 'ws');
// Sentry (ADR-0031): chỉ khi có DSN mới mở CSP cho máy chủ nhận lỗi, và chỉ đúng origin đó.
const sentryOrigin = process.env.NEXT_PUBLIC_SENTRY_DSN
  ? ` ${new URL(process.env.NEXT_PUBLIC_SENTRY_DSN).origin}`
  : '';

/**
 * CSP không dùng nonce (ADR-0027). Nonce cần render động theo từng request, còn app dùng
 * cacheComponents (HTML tĩnh dựng sẵn), nên theo hướng dẫn "Without Nonces" của Next 16:
 * `'unsafe-inline'` cho script/style (Next chèn script khởi tạo inline) và `'unsafe-eval'` chỉ ở dev
 * (React Refresh). Rủi ro còn lại: XSS qua script inline không bị CSP chặn; bù lại nội dung người
 * dùng luôn là văn bản thuần (e2e kiểm tra) và mọi nguồn khác bị giới hạn ở 'self' + API.
 */
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isProduction ? '' : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' blob: data:",
  "font-src 'self'",
  `connect-src 'self' ${apiOrigin} ${wsOrigin}${sentryOrigin}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  // Chỉ khi triển khai thật (production + API https): chạy thử `next start` trên http://localhost
  // không có https để nâng cấp.
  ...(isProduction && apiOrigin.startsWith('https:') ? ['upgrade-insecure-requests'] : []),
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Bổ sung cho frame-ancestors ở trình duyệt cũ.
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=()' },
  // Trình duyệt chỉ áp dụng qua HTTPS: production sau proxy TLS (Caddy) sẽ có hiệu lực.
  ...(isProduction
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' }]
    : []),
];

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
  async headers() {
    return [{ source: '/(.*)', headers: securityHeaders }];
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
