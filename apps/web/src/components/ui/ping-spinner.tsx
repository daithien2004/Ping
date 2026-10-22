'use client';

import { Spin, type SpinProps as AntdSpinProps } from 'antd';

export type PingSpinnerProps = AntdSpinProps;

export function PingSpinner(props: PingSpinnerProps) {
  return <Spin data-testid="ping-spinner" {...props} />;
}
