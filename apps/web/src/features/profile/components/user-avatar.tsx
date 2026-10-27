'use client';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { initials } from '@/lib/initials';
import { profileImageUrl } from '../hooks';

/** Avatar với ảnh hồ sơ (TG.7) và fallback chữ cái nhất quán khi chưa có/không tải được ảnh. */
export function UserAvatar({
  name,
  avatarUrl,
  size = 'default',
  className,
}: {
  name: string;
  avatarUrl: string | null | undefined;
  size?: 'default' | 'sm' | 'lg';
  className?: string;
}) {
  return (
    <Avatar size={size} className={className} title={name}>
      <AvatarImage src={profileImageUrl(avatarUrl)} alt={name} />
      <AvatarFallback>{initials(name)}</AvatarFallback>
    </Avatar>
  );
}
