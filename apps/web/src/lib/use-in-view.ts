'use client';
import { useEffect, useRef, useState, type RefObject } from 'react';

/**
 * Tải lười bằng IntersectionObserver — không thêm dependency. Trả về ref gắn vào phần tử và
 * cờ "đã từng hiện": một lần hiện là đủ để fetch (lưới GIF trong picker không rời mắt khi mở;
 * tệp đính kèm đã có link thì cache TanStack giữ tiếp). Dùng cho lưới GIF (TG.25, ADR-0069)
 * và ảnh đính kèm (ADR-0079).
 */
export function useInView<T extends HTMLElement>(
  rootMargin = '100px',
): {
  ref: RefObject<T | null>;
  inView: boolean;
} {
  const ref = useRef<T>(null);
  // Môi trường không có IntersectionObserver (trình duyệt cũ): coi như đã hiện ngay từ mount —
  // tính trong lazy initializer (tính sẵn của IO không đổi lúc chạy) thay vì setState trong effect.
  const [inView, setInView] = useState(() => typeof IntersectionObserver === 'undefined');
  useEffect(() => {
    const el = ref.current;
    if (!el || inView) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) setInView(true);
      },
      { rootMargin },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [inView, rootMargin]);
  return { ref, inView };
}
