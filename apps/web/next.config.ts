import { fileURLToPath } from 'node:url';
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
  // TG.25 (ADR-0069): ảnh GIF là nguồn ngoài duy nhất được nhúng vào tin — backend là cổng duy
  // nhất gọi nhà cung cấp, URL trả về chỉ được nhận khi thuộc host allowlist
  // `GIF_IMAGE_HOSTS` (packages/shared/src/schemas/gif.ts, hiện: media.tenor.com của Tenor).
  // CSP là lớp chặn sau; không mở wildcard — cần origin nào mới thêm đúng origin đó.
  `img-src 'self' blob: data: ${apiOrigin} https://media.tenor.com`,
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

// Chỉ khi build image (apps/web/Dockerfile đặt NEXT_OUTPUT=standalone): bản chạy gọn cho container.
// Ở local để mặc định để `next start` còn dùng được. Gốc truy vết là gốc monorepo vì web import @ping/shared.
const standalone =
  process.env.NEXT_OUTPUT === 'standalone'
    ? {
        output: 'standalone' as const,
        outputFileTracingRoot: fileURLToPath(new URL('../..', import.meta.url)),
      }
    : {};

const nextConfig: NextConfig = {
  ...standalone,
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
  /**
   * ADR-0088: URL công khai theo dạng Discord `/channels/{serverId|@me}/{channelId}[/{messageId}]`.
   * Redirect chạy trước rewrite (thứ tự của Next), nên đích rewrite `/servers/...`, `/dms/...`
   * không bị redirect ngược. `/servers/:id/settings` có ba đoạn nên không khớp rule hai đoạn.
   */
  async redirects() {
    return [
      { source: '/dms', destination: '/channels/@me', permanent: true },
      {
        source: '/dms/:channelId/messages/:messageId',
        destination: '/channels/@me/:channelId/:messageId',
        permanent: true,
      },
      {
        source: '/dms/:channelId',
        destination: '/channels/@me/:channelId',
        permanent: true,
      },
      {
        source: '/servers/:serverId/channels/:channelId/messages/:messageId',
        destination: '/channels/:serverId/:channelId/:messageId',
        permanent: true,
      },
      {
        source: '/servers/:serverId/channels/:channelId',
        destination: '/channels/:serverId/:channelId',
        permanent: true,
      },
      { source: '/servers/:serverId', destination: '/channels/:serverId', permanent: true },
    ];
  },
  /** ADR-0088: URL công khai render route nội bộ; `@me` đặt trước `:serverId` để không bị nuốt. */
  async rewrites() {
    return [
      { source: '/channels/@me', destination: '/dms' },
      { source: '/channels/@me/:channelId', destination: '/dms/:channelId' },
      {
        source: '/channels/@me/:channelId/:messageId',
        destination: '/dms/:channelId/messages/:messageId',
      },
      { source: '/channels/:serverId', destination: '/servers/:serverId' },
      {
        source: '/channels/:serverId/:channelId',
        destination: '/servers/:serverId/channels/:channelId',
      },
      {
        source: '/channels/:serverId/:channelId/:messageId',
        destination: '/servers/:serverId/channels/:channelId/messages/:messageId',
      },
    ];
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
