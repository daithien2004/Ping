'use client';

import { Tooltip, type TooltipProps as AntdTooltipProps } from 'antd';

export type PingTooltipProps = AntdTooltipProps;

/**
 * Tooltip chỉ để đọc nên cho con trỏ xuyên qua. Nếu chặn pointer events, tooltip đè lên phần tử
 * kế bên (rail server → danh sách kênh) sẽ giữ hover của trigger và nuốt cú bấm vào phần tử nằm
 * dưới — người dùng bấm hụt, e2e click treo vô hạn.
 */
export function PingTooltip(props: PingTooltipProps) {
  return (
    <Tooltip data-testid="ping-tooltip" {...props} styles={{ root: { pointerEvents: 'none' } }} />
  );
}
