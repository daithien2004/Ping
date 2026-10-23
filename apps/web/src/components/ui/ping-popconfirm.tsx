'use client';

import { Popconfirm } from 'antd';
import type { ReactNode } from 'react';

/**
 * API riêng của `PingPopconfirm` (ADR-0050): chỉ mô tả việc xác nhận hành động nguy hiểm,
 * không rò prop antd ra ngoài.
 */
export interface PingPopconfirmProps {
  /** Câu hỏi xác nhận. */
  title: ReactNode;
  /** Giải thích thêm (mặc định rỗng). */
  description?: ReactNode;
  /** Nút mở hộp xác nhận. */
  children: ReactNode;
  /** Chạy khi người dùng xác nhận. */
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
