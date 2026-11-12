'use client';

import { Dropdown, type DropdownProps as AntdDropdownProps } from 'antd';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { POPUP_STYLES } from './popup-styles';

/**
 * Menu con của antd nằm ở z 1050 (seed 1000 + 50) nên lớp chặn đặt ngay dưới để menu vẫn bấm được.
 * Bấm ra ngoài chỉ đóng menu — không kích hoạt nút bên dưới, như `scrim` của PingPopover.
 */
const SCRIM_Z_INDEX = 1049;

export type PingDropdownProps = AntdDropdownProps;

/**
 * Menu của Dropdown tự gắn `boxShadowSecondary` (bóng mờ của antd) ở `.ant-dropdown-menu`;
 * style inline trên Menu root thay bằng bóng panel chung (POPUP_STYLES) như Modal/Popover.
 */
export function PingDropdown({ menu, open, onOpenChange, ...props }: PingDropdownProps) {
  // Nơi gọi chỉ dùng trigger + menu (không truyền `open`), wrapper tự giữ trạng thái để dựng lớp chặn.
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
