'use client';

import { useEffect, useEffectEvent, type ReactNode } from 'react';
import { PingModal } from '@/components/ui/ping-modal';

interface MessageDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/** Đóng thì gỡ nội dung khỏi DOM (`destroyOnHidden`), nên form bên trong luôn mở ra trống. */
export function MessageDialog({ open, onClose, title, children }: MessageDialogProps) {
  // Hàng tin chứa hộp thoại có thể bị gỡ khi ảo hóa: báo nơi gọi để xóa trạng thái "đang mở".
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
