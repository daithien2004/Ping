'use client';

import { Popover } from 'antd';
import type { ComponentProps } from 'react';

export type PingPopoverProps = ComponentProps<typeof Popover>;

export function PingPopover(props: PingPopoverProps) {
  return <Popover data-testid="ping-popover" {...props} />;
}
