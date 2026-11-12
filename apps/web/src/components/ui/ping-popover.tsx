'use client';

import { Popover } from 'antd';
import { createPortal } from 'react-dom';
import type { ComponentProps } from 'react';
import { POPUP_STYLES } from './popup-styles';

export type PingPopoverProps = ComponentProps<typeof Popover> & {
  /** Chặn tương tác phần còn lại như một lớp phủ: bấm ra ngoài chỉ đóng popover. */
  scrim?: boolean;
};

/** Trên antd `zIndexPopupBase + 70` (1070) để phủ mọi bề mặt app nhưng vẫn dưới toast. */
const POPOVER_Z_INDEX = 1070;

export function PingPopover({
  styles,
  scrim = false,
  open,
  onOpenChange,
  zIndex,
  ...props
}: PingPopoverProps) {
  // `container` giữ bóng panel dùng chung kể cả khi nơi gọi chỉ muốn đổi padding.
  const mergedStyles =
    typeof styles === 'function'
      ? (info: { props: PingPopoverProps }) => {
          const resolved = styles(info) ?? {};
          return {
            ...POPUP_STYLES,
            ...resolved,
            container: { ...POPUP_STYLES.container, ...resolved.container },
          };
        }
      : {
          ...POPUP_STYLES,
          ...styles,
          container: { ...POPUP_STYLES.container, ...styles?.container },
        };
  return (
    <>
      {/* Portal để lớp chặn nằm trên cả vùng cuộn tin nhắn; trong suốt nên không che nội dung. */}
      {scrim &&
        open &&
        typeof document !== 'undefined' &&
        createPortal(
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            data-testid="ping-popover-scrim"
            className="fixed inset-0 m-0 cursor-default border-0 bg-transparent p-0"
            style={{ zIndex: POPOVER_Z_INDEX - 1 }}
            onClick={() => onOpenChange?.(false)}
          />,
          document.body,
        )}
      <Popover
        data-testid="ping-popover"
        {...props}
        open={open}
        onOpenChange={onOpenChange}
        zIndex={scrim ? (zIndex ?? POPOVER_Z_INDEX) : zIndex}
        styles={mergedStyles}
      />
    </>
  );
}
