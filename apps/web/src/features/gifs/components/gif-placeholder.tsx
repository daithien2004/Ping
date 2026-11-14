'use client';
import { Play } from 'lucide-react';

export const GIF_MAX_HEIGHT = 320;

export function GifPlaceholder({
  width,
  height,
  label,
  maxHeight = GIF_MAX_HEIGHT,
}: {
  width: number;
  height: number;
  label: string;
  maxHeight?: number;
}) {
  return (
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
