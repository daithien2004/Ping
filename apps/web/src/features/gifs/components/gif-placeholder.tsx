'use client';
import { Play } from 'lucide-react';

/** Trần chiều cao của GIF trong tin — như sticker lớn, giữ tỉ lệ thật của ảnh. */
export const GIF_MAX_HEIGHT = 320;

/**
 * Khối giữ chỗ đúng tỉ lệ GIF (TG.25, ADR-0069): GIF của Tenor không có khung tĩnh nên khi
 * người dùng bật `prefers-reduced-motion` ta render nền mờ + biểu tượng phát thay vì tự phát
 * ảnh động. Nơi bọc quyết định bấm vào có phát hay không (tin GIF) hay chỉ là ô lưới (picker).
 * Diện tích khoanh sẵn theo width/height của GIF nên không nhảy layout khi ảnh chưa tải.
 */
export function GifPlaceholder({
  width,
  height,
  label,
  maxHeight = GIF_MAX_HEIGHT,
}: {
  width: number;
  height: number;
  /** Nhãn ngắn hiện giữa khối (i18n: "GIF" trong ô lưới, "Phát GIF" trong tin). */
  label: string;
  maxHeight?: number;
}) {
  return (
    // Phần tử trang trí: tên truy cập đọc ở nút bọc bên ngoài (aria-label).
    <span
      aria-hidden
      style={{
        aspectRatio: `${width} / ${height}`,
        width: `min(100%, calc(${maxHeight}px * ${width} / ${height}))`,
      }}
      className="flex items-center justify-center gap-1 overflow-hidden rounded-lg bg-muted text-muted-foreground"
    >
      <Play className="size-5 shrink-0" aria-hidden />
      <span className="truncate px-1 text-xs">{label}</span>
    </span>
  );
}
