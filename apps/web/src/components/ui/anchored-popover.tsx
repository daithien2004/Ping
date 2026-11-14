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

const GAP = 4;
const PADDING = 8;
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

export function AnchoredPopover({
  anchorRef,
  onDismiss,
  width = 420,
  children,
}: {
  anchorRef: RefObject<HTMLElement | null>;
  onDismiss: () => void;
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
      if (rect.height === 0) return;
      const panelWidth = rect.width;
      const panelHeight = rect.height;
      const roomLeft = trigger.left - GAP;
      const roomRight = vw - trigger.right - GAP;
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
