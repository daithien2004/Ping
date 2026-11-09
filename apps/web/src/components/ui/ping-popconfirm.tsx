'use client';

import { Popconfirm } from 'antd';
import type { ReactNode } from 'react';

export interface PingPopconfirmProps {
  title: ReactNode;
  description?: ReactNode;
  /** Nút mở hộp xác nhận. */
  children: ReactNode;
  onConfirm: () => void;
  okText?: string;
  cancelText?: string;
  disabled?: boolean;
}

export function PingPopconfirm({
  title,
  description,
  children,
  onConfirm,
  okText,
  cancelText,
  disabled = false,
}: PingPopconfirmProps) {
  return (
    <Popconfirm
      data-testid="ping-popconfirm"
      title={title}
      description={description}
      onConfirm={onConfirm}
      okText={okText}
      cancelText={cancelText}
      disabled={disabled}
    >
      {children}
    </Popconfirm>
  );
}
