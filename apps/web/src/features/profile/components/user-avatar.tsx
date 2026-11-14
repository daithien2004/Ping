'use client';

import type { CSSProperties } from 'react';
import { PingAvatar } from '@/components/ui/ping-avatar';
import { initials } from '@/lib/initials';
import { profileImageUrl } from '../hooks';

const sizeMap = { sm: 24, default: 32, lg: 40 } as const;

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
  style?: CSSProperties;
}) {
  // antd không khai báo `title` trong AvatarProps nhưng vẫn chuyển tiếp xuống <span>; truyền qua biến để đúng kiểu.
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
