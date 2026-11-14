'use client';

import { Dropdown, type DropdownProps as AntdDropdownProps } from 'antd';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { POPUP_STYLES } from './popup-styles';

const SCRIM_Z_INDEX = 1049;

export type PingDropdownProps = AntdDropdownProps;

export function PingDropdown({ menu, open, onOpenChange, ...props }: PingDropdownProps) {
  const [innerOpen, setInnerOpen] = useState(false);
  const isOpen = open ?? innerOpen;
  const mergedMenu = menu && {
    ...menu,
    style: { boxShadow: POPUP_STYLES.container.boxShadow, ...menu.style },
  };

  function handleOpenChange(next: boolean, info: { source: 'trigger' | 'menu' }) {
    setInnerOpen(next);
    onOpenChange?.(next, info);
  }

  return (
    <>
      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <button
            type="button"
            aria-hidden
            tabIndex={-1}
            data-testid="ping-dropdown-scrim"
            className="fixed inset-0 m-0 cursor-default border-0 bg-transparent p-0"
            style={{ zIndex: SCRIM_Z_INDEX }}
            onClick={() => handleOpenChange(false, { source: 'trigger' })}
          />,
          document.body,
        )}
      <Dropdown
        data-testid="ping-dropdown"
        {...props}
        menu={mergedMenu}
        open={isOpen}
        onOpenChange={handleOpenChange}
      />
    </>
  );
}
