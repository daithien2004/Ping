'use client';

import { Popover } from 'antd';
import { createPortal } from 'react-dom';
import type { ComponentProps } from 'react';
import { POPUP_STYLES } from './popup-styles';

export type PingPopoverProps = ComponentProps<typeof Popover> & {
  scrim?: boolean;
};

const POPOVER_Z_INDEX = 1070;

export function PingPopover({
  styles,
  scrim = false,
  open,
  onOpenChange,
  zIndex,
  ...props
}: PingPopoverProps) {
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
