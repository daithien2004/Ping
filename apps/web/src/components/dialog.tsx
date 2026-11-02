'use client';

import { useEffect, useEffectEvent, type ReactNode } from 'react';
import { PingModal } from '@/components/ui/ping-modal';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/**
 * Hộp thoại của app trên PingModal (antd): Esc và bấm nền để đóng, antd tự khóa focus và trả
 * focus về phần tử đã mở (e2e keyboard.spec), vai trò dialog + tiêu đề cho trình đọc màn hình.
 * Đóng thì nội dung bị gỡ khỏi DOM (`destroyOnHidden`), nên form trong hộp thoại luôn mở ra trống.
 */
export function Dialog({ open, onClose, title, children }: DialogProps) {
  // Hộp thoại có thể bị gỡ khỏi DOM khi hàng tin chứa nó biến mất (ảo hóa): báo cho nơi gọi biết
  // để nó xóa trạng thái chọn, không để treo "đang mở" trên một hộp thoại không còn tồn tại.
  const closeOnHide = useEffectEvent(onClose);
  useEffect(() => {
    if (!open) return;
    let visible = false;
    const frame = requestAnimationFrame(() => {
      visible = true;
    });
    return () => {
      cancelAnimationFrame(frame);
      if (visible) closeOnHide();
    };
  }, [open]);
  return (
    <PingModal open={open} onCancel={onClose} title={title} footer={null} destroyOnHidden>
      {children}
    </PingModal>
  );
}
