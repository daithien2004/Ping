'use client';
import { useEffect, useState } from 'react';

/**
 * `prefers-reduced-motion` đọc một lần lúc mount rồi nghe thay đổi: state đồng bộ với hệ
 * điều hành (bên ngoài) qua effect — không tính dữ liệu trong render. Hook dùng chung cho
 * tin sticker (TG.22) và GIF (TG.25, ADR-0069) — GIF không có khung tĩnh nên nơi dùng tự
 * quyết định render giữ chỗ hay ảnh thật.
 */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () =>
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);
  return reduced;
}
