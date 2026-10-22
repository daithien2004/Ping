'use client';

import { Avatar, type AvatarProps as AntdAvatarProps } from 'antd';

export interface PingAvatarProps extends AntdAvatarProps {
  presence?: 'online' | 'idle' | 'dnd' | 'offline';
}

const presenceColor: Record<NonNullable<PingAvatarProps['presence']>, string> = {
  online: '#2f9e6a',
  idle: '#d6a32a',
  dnd: '#d63b2a',
  offline: '#7a7a92',
};

export function PingAvatar({ presence, ...rest }: PingAvatarProps) {
  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <Avatar data-testid="ping-avatar" {...rest} />
      {presence ? (
        <span
          aria-label={presence}
          style={{
            position: 'absolute',
            right: 0,
            bottom: 0,
            width: 10,
            height: 10,
            borderRadius: 9999,
            background: presenceColor[presence],
            border: '2px solid var(--ping-color-bg)',
          }}
        />
      ) : null}
    </span>
  );
}
