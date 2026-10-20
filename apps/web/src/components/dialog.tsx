'use client';

import { useEffect, useEffectEvent, type ReactNode } from 'react';
import { useTranslations } from 'use-intl';
import {
  Dialog as DialogRoot,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/**
 * Hộp thoại của app trên Dialog của shadcn (Radix): Esc, khóa focus, trả focus về nút đã mở,
 * vai trò dialog + tiêu đề cho trình đọc màn hình. Đóng thì nội dung bị gỡ khỏi DOM (khác
 * <dialog> gốc trước đây), nên form trong hộp thoại luôn mở ra trống.
 */
export function Dialog({ open, onClose, title, children }: DialogProps) {
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
  const t = useTranslations('common');
  return (
    <DialogRoot open={open} onOpenChange={(next) => !next && onClose()}>
      {/* Không có mô tả riêng: báo cho Radix để nó không cảnh báo thiếu Description. */}
      <DialogContent closeLabel={t('close')} aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children}
      </DialogContent>
    </DialogRoot>
  );
}
