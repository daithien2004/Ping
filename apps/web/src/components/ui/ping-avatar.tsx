'use client';

import { Avatar, type AvatarProps as AntdAvatarProps } from 'antd';
import { toAntdSize, type PingSize } from './size';

const PRESENCE = {
  online: 'bg-online',
  idle: 'bg-idle',
  dnd: 'bg-dnd',
  offline: 'bg-offline',
} as const;

type PingPresence = keyof typeof PRESENCE;

/** `presenceLabel` là chữ đã dịch cho trình đọc màn hình; bắt buộc đi kèm `presence`. */
type PresenceProps =
  | { presence?: undefined; presenceLabel?: undefined }
  | { presence: PingPresence; presenceLabel: string };

export type PingAvatarProps = Omit<AntdAvatarProps, 'size'> &
  PresenceProps & {
    /** Bậc cỡ, hoặc đường kính px. */
    size?: PingSize | number;
  };

export function PingAvatar({ presence, presenceLabel, size, ...rest }: PingAvatarProps) {
  const antdSize = typeof size === 'number' ? size : size ? toAntdSize(size) : undefined;
  return (
    <span className="relative inline-flex">
      <Avatar data-testid="ping-avatar" {...rest} data-slot="avatar" size={antdSize} />
      {presence ? (
        <span
          role="img"
          aria-label={presenceLabel}
          data-slot="presence"
          data-presence={presence}
          className={`absolute right-[4%] bottom-[4%] aspect-square w-[30%] min-w-2 rounded-full border-2 border-background ${PRESENCE[presence]}`}
        />
      ) : null}
    </span>
  );
}
