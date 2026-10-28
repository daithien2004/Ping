'use client';

import { Popover, type PopoverProps as AntdPopoverProps } from 'antd';
import { forwardRef } from 'react';

export type PingPopoverProps = AntdPopoverProps;

/** Bọc antd Popover cho bộ Ping* — feature chỉ dùng wrapper này, không lộ prop antd ra ngoài. */
export const PingPopover = forwardRef<HTMLDivElement, PingPopoverProps>(
  function PingPopover(props, ref) {
    return <Popover ref={ref as never} data-testid="ping-popover" {...props} />;
  },
);
