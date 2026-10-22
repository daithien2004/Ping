'use client';

import { Segmented, type SegmentedProps as AntdSegmentedProps } from 'antd';
import { forwardRef } from 'react';

export type PingSegmentedProps = AntdSegmentedProps;

export const PingSegmented = forwardRef<HTMLDivElement, PingSegmentedProps>(
  function PingSegmented(props, ref) {
    return <Segmented ref={ref as never} data-testid="ping-segmented" {...props} />;
  },
);
