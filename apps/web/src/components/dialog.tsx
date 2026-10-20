'use client';

import { useEffect, useRef, type ReactNode } from 'react';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}

/**
 * Bọc thẻ <dialog> gốc của trình duyệt: showModal() tự lo phím Esc, khóa focus trong hộp thoại,
 * nền mờ (::backdrop) và vai trò dialog cho trình đọc màn hình — không cần thư viện modal.
 */
export function Dialog({ open, onClose, title, children }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      // Esc hoặc dialog.close() đều phát sự kiện close: đồng bộ lại state `open` của cha.
      onClose={onClose}
      aria-labelledby="dialog-title"
      className="m-auto w-full max-w-sm rounded-lg p-6 backdrop:bg-black/50 dark:bg-gray-900 dark:text-gray-100"
    >
      <h2 id="dialog-title" className="mb-4 text-lg font-semibold">
        {title}
      </h2>
      {children}
    </dialog>
  );
}
