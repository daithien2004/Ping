'use client';

import { useEffect, useEffectEvent, type ReactNode } from 'react';
import { PingModal } from '@/components/ui/ping-modal';

interface MessageDialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

export function MessageDialog({ open, onClose, title, children }: MessageDialogProps) {
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
