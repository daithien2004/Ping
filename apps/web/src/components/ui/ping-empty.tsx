'use client';

import { Empty, type EmptyProps as AntdEmptyProps } from 'antd';

export type PingEmptyProps = Omit<AntdEmptyProps, 'image'> & {
  /** Hình khay nhỏ cho khung hẹp (popup, danh sách); bỏ trống thì dùng hình hộp lớn. */
  compact?: boolean;
};

export function PingEmpty({ compact, ...rest }: PingEmptyProps) {
  return (
    <Empty
      data-testid="ping-empty"
      {...rest}
      image={compact ? Empty.PRESENTED_IMAGE_SIMPLE : Empty.PRESENTED_IMAGE_DEFAULT}
    />
  );
}
