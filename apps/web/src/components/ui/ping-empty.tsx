'use client';

import { Empty, type EmptyProps as AntdEmptyProps } from 'antd';

export type PingEmptyProps = Omit<AntdEmptyProps, 'image'> & {
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
