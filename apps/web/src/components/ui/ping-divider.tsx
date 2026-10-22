'use client';

import { Divider, type DividerProps as AntdDividerProps } from 'antd';

export type PingDividerProps = AntdDividerProps;

export function PingDivider(props: PingDividerProps) {
  return <Divider data-testid="ping-divider" {...props} />;
}
