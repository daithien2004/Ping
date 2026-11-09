'use client';

import { Tooltip, type TooltipProps as AntdTooltipProps } from 'antd';

export type PingTooltipProps = AntdTooltipProps;

/** Cho con trỏ xuyên qua: tooltip chặn chuột sẽ nuốt cú bấm vào phần tử nằm dưới nó. */
export function PingTooltip(props: PingTooltipProps) {
  return (
    <Tooltip data-testid="ping-tooltip" {...props} styles={{ root: { pointerEvents: 'none' } }} />
  );
}
