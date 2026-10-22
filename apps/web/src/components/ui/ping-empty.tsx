'use client';

import { Empty, type EmptyProps as AntdEmptyProps } from 'antd';

export type PingEmptyProps = AntdEmptyProps;

export function PingEmpty(props: PingEmptyProps) {
  return <Empty data-testid="ping-empty" {...props} />;
}
