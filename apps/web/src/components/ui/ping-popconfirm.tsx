'use client';

import { Popconfirm, type PopconfirmProps } from 'antd';

/** API đóng; `children` là nút mở hộp xác nhận. */
export type PingPopconfirmProps = Pick<
  PopconfirmProps,
  'title' | 'description' | 'children' | 'onConfirm' | 'okText' | 'cancelText' | 'disabled'
>;

export function PingPopconfirm(props: PingPopconfirmProps) {
  return <Popconfirm data-testid="ping-popconfirm" {...props} />;
}
