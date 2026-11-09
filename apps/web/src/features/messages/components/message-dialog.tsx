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
  // Hàng tin chứa hộp thoại có thể bị gỡ khi ảo hóa: nếu gỡ lúc còn mở thì báo nơi gọi để xóa
  // trạng thái "đang mở". Chỉ chạy khi unmount (không phải mỗi lần đóng) nên không gọi onClose hai lần.
  const closeIfOpen = useEffectEvent(() => {
    if (open) onClose();
  });
  useEffect(() => {
    let mounted = false;
    const frame = requestAnimationFrame(() => {
      mounted = true;
    });
    return () => {
      cancelAnimationFrame(frame);
      if (mounted) closeIfOpen();
    };
  }, []);
  return (
    <PingModal open={open} onCancel={onClose} title={title} footer={null} destroyOnHidden>
      {children}
    </PingModal>
  );
}
