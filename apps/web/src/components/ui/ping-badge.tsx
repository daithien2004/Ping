'use client';

import { Badge, type BadgeProps as AntdBadgeProps } from 'antd';

export type PingBadgeProps = AntdBadgeProps;

export function PingBadge(props: PingBadgeProps) {
  return <Badge data-testid="ping-badge" {...props} />;
}
