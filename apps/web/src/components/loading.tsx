'use client';

import { useTranslations } from 'use-intl';

/**
 * Chữ "Đang tải…" theo ngôn ngữ, luôn căn giữa vùng chứa nó. Client component để layout (Server
 * Component) dùng làm fallback. `fullScreen`: cho fallback ở cấp trang, chiếm cả chiều cao màn hình
 * (antd App bọc một div cao theo nội dung nên `m-auto` của body không đủ để căn giữa theo chiều dọc).
 */
export function Loading({
  className = 'text-sm text-muted-foreground',
  fullScreen = false,
}: {
  className?: string;
  fullScreen?: boolean;
}) {
  const t = useTranslations('common');
  const size = fullScreen ? 'min-h-dvh' : 'min-h-40 flex-1';
  return (
    <p
      data-slot="loading"
      className={`flex w-full items-center justify-center ${size} ${className}`}
    >
      <span data-slot="loading-label">{t('loading')}</span>
    </p>
  );
}
