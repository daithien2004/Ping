'use client';

import { Segmented, type SegmentedProps as AntdSegmentedProps } from 'antd';
import { toAntdSize, type PingSize } from './size';

export interface PingSegmentedProps extends Omit<AntdSegmentedProps, 'size'> {
  size?: PingSize;
}

export function PingSegmented({ size, ...rest }: PingSegmentedProps) {
  return (
    <Segmented data-testid="ping-segmented" {...rest} size={size ? toAntdSize(size) : undefined} />
  );
}
