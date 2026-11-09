'use client';

import { Drawer } from 'antd';
import type { ReactNode } from 'react';

export interface PingDrawerProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Bề rộng ngăn kéo (px hoặc CSS), không phải bậc cỡ Ping. */
  size?: number | string;
}

export function PingDrawer({ open, onClose, title, children, footer, size }: PingDrawerProps) {
  return (
    <Drawer
      data-testid="ping-drawer"
      open={open}
      onClose={onClose}
      title={title}
      footer={footer}
      size={size}
    >
      {children}
    </Drawer>
  );
}
