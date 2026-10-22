'use client';

import { Empty, type EmptyProps as AntdEmptyProps } from 'antd';

export type PingEmptyProps = AntdEmptyProps;

/** Ảnh mặc định của antd (đơn giản) — bọc riêng vì wrapper không mang static của antd. */
export const PING_EMPTY_IMAGE_SIMPLE = Empty.PRESENTED_IMAGE_SIMPLE;

export function PingEmpty(props: PingEmptyProps) {
  return <Empty data-testid="ping-empty" {...props} />;
}
