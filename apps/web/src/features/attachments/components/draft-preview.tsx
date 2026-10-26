'use client';
import { useEffect, useRef } from 'react';

/** Local draft only; URLs are released when Activity hides the composer. */
export function DraftPreview({ file }: { file: File }) {
  const image = useRef<HTMLImageElement>(null);
  useEffect(() => {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return;
    const next = URL.createObjectURL(file);
    if (image.current) image.current.src = next;
    return () => URL.revokeObjectURL(next);
  }, [file]);
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img ref={image} alt={file.name} className="mb-1 h-16 max-w-32 rounded object-contain" />;
}
