'use client';

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';

/** Khe hở ngang cố định giữa nút neo và panel (khớp offset 4 px antd dùng cho popover khác). */
const GAP = 4;
/** Lề an toàn tới mép khung nhìn — như `padding` của floating-ui. */
const PADDING = 8;
/** Nút neo nằm ở khoảng 1/3 chiều cao panel, giống picker cảm xúc của Discord. */
const ANCHOR_RATIO = 1 / 3;
const Z_INDEX = 1070;

interface Box {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(value, Math.max(min, max)));
}

/**
 * Panel nổi neo vào một nút, hành xử như floating-ui: khe hở cố định, tự chọn bên trái/phải,
 * luôn nằm trọn khung nhìn, và co lại khi khung quá thấp (phần thừa dồn cho vùng cuộn bên trong).
 * Khác antd Popover ở chỗ vị trí dọc tính từ chiều cao panel, không dựa vào shift của nó.
 */
export function AnchoredPopover({
  anchorRef,
  onDismiss,
  width = 420,
  children,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  /** Bấm ra ngoài hoặc Esc. */
  onDismiss: () => void;
  /** Bề rộng mong muốn; tự co khi khung hẹp hơn. */
  width?: number;
  children: ReactNode;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<Box>();

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!panel) return;

    const place = () => {
      const trigger = anchorRef.current?.getBoundingClientRect();
      if (!trigger) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const rect = panel.getBoundingClientRect();
      // Nội dung (chunk picker) mount muộn — chờ có kích thước thật rồi mới đặt.
      if (rect.height === 0) return;
      const panelWidth = rect.width;
      const panelHeight = rect.height;
      const roomLeft = trigger.left - GAP;
      const roomRight = vw - trigger.right - GAP;
      // Ưu tiên bên trái như Discord; hết chỗ bên trái mới sang phải, không đủ cả hai thì lấy phía rộng hơn.
      const useLeft =
        roomLeft >= panelWidth || (!(roomRight >= panelWidth) && roomLeft >= roomRight);
      const left = useLeft ? trigger.left - GAP - panelWidth : trigger.right + GAP;
      const next: Box = {
        left: clamp(left, PADDING, vw - PADDING - panelWidth),
        top: clamp(trigger.top - panelHeight * ANCHOR_RATIO, PADDING, vh - PADDING - panelHeight),
        width: Math.min(width, vw - PADDING * 2),
        maxHeight: vh - PADDING * 2,
      };
      setBox((prev) =>
        prev &&
        prev.left === next.left &&
        prev.top === next.top &&
        prev.width === next.width &&
        prev.maxHeight === next.maxHeight
          ? prev
          : next,
      );
    };

    place();
    // Picker nạp theo chunk và ảnh có thể đổi chiều cao nội dung — đo lại khi panel đổi cỡ.
    const observer = new ResizeObserver(place);
    observer.observe(panel);
    window.addEventListener('resize', place);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', place);
    };
  }, [anchorRef, width]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onDismiss();
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onDismiss]);

  if (typeof document === 'undefined') return null;

  return createPortal(
    <>
      {/* Chặn phần còn lại như lớp phủ: panel nằm trên, mọi bấm ngoài chỉ đóng panel. */}
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        data-testid="ping-popover-scrim"
        className="fixed inset-0 m-0 cursor-default border-0 bg-transparent p-0"
        style={{ zIndex: Z_INDEX - 1 }}
        onClick={onDismiss}
      />
      <div
        ref={panelRef}
        data-testid="anchored-popover"
        className="fixed flex flex-col overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-panel"
        style={{
          left: box?.left ?? 0,
          top: box?.top ?? 0,
          width: box?.width ?? Math.min(width, window.innerWidth - PADDING * 2),
          maxHeight: box?.maxHeight ?? window.innerHeight - PADDING * 2,
          visibility: box ? 'visible' : 'hidden',
          zIndex: Z_INDEX,
        }}
      >
        {children}
      </div>
    </>,
    document.body,
  );
}
