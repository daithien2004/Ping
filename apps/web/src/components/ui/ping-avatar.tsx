'use client';

import { Avatar, type AvatarProps as AntdAvatarProps } from 'antd';
import { toAntdSize, type PingSize } from './size';

export interface PingAvatarProps extends Omit<AntdAvatarProps, 'size'> {
  /** Bậc cỡ, hoặc đường kính px. */
  size?: PingSize | number;
  presence?: 'online' | 'idle' | 'dnd' | 'offline';
}

const presenceColor: Record<NonNullable<PingAvatarProps['presence']>, string> = {
  online: 'var(--online)',
  idle: 'var(--idle)',
  dnd: 'var(--dnd)',
  offline: 'var(--offline)',
};

export function PingAvatar({ presence, size, ...rest }: PingAvatarProps) {
  const antdSize = typeof size === 'number' ? size : size ? toAntdSize(size) : undefined;
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <Avatar data-testid="ping-avatar" data-slot="avatar" {...rest} size={antdSize} />
      {presence ? (
        <span
          role="img"
          aria-label={presence}
          style={{
            position: 'absolute',
            right: 0,
            bottom: 0,
            width: 10,
            height: 10,
            borderRadius: 9999,
            background: presenceColor[presence],
            border: '2px solid var(--background)',
          }}
        />
      ) : null}
    </span>
  );
}
