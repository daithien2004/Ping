'use client';

import { Drawer } from 'antd';
import type { ReactNode } from 'react';

/**
 * API riêng của `PingDrawer` (ADR-0050): ngăn kéo chi tiết, không rò prop antd ra ngoài.
 */
export interface PingDrawerProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  /** Bề rộng ngăn kéo (antd v6 dùng `size` cho ngăn kéo). */
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
