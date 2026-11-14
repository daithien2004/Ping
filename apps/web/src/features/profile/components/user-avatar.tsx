'use client';

import type { CSSProperties } from 'react';
import { PingAvatar } from '@/components/ui/ping-avatar';
import { initials } from '@/lib/initials';
import { profileImageUrl } from '../hooks';

/** Cỡ avatar theo thang cũ (sm/default/lg) hoặc số px trực tiếp → đường kính của antd. */
const sizeMap = { sm: 24, default: 32, lg: 40 } as const;

/** Avatar với ảnh hồ sơ (TG.7) và fallback chữ cái nhất quán khi chưa có/không tải được ảnh. */
export function UserAvatar({
  name,
  avatarUrl,
  size = 'default',
  className,
  style,
}: {
  name: string;
  avatarUrl: string | null | undefined;
  size?: 'default' | 'sm' | 'lg' | number;
  className?: string;
  /** Bo góc/màu nền khi antd không cho đặt bằng class (xem ui-system §4). */
  style?: CSSProperties;
}) {
  // antd không khai báo `title` trong AvatarProps nhưng vẫn chuyển tiếp prop lạ xuống <span> gốc,
  // nên truyền qua biến để giữ tooltip tên như Avatar cũ mà vẫn đúng kiểu.
  const titleAttribute = { title: name };
  return (
    <PingAvatar
      {...titleAttribute}
      size={typeof size === 'number' ? size : sizeMap[size]}
      src={profileImageUrl(avatarUrl)}
      alt={name}
      className={className}
      style={style}
    >
      {initials(name)}
    </PingAvatar>
  );
}
