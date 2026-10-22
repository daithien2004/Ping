'use client';

import { Popconfirm, type PopconfirmProps as AntdPopconfirmProps } from 'antd';

export type PingPopconfirmProps = AntdPopconfirmProps;

export function PingPopconfirm(props: PingPopconfirmProps) {
  return <Popconfirm data-testid="ping-popconfirm" {...props} />;
}
