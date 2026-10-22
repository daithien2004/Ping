'use client';

import { Tooltip, type TooltipProps as AntdTooltipProps } from 'antd';

export type PingTooltipProps = AntdTooltipProps;

export function PingTooltip(props: PingTooltipProps) {
  return <Tooltip data-testid="ping-tooltip" {...props} />;
}
