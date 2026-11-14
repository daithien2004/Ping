import { useRef, useState } from 'react';

/**
 * Thanh mục dọc bên trái kiểu Discord (emoji/sticker picker): bấm icon → bỏ tìm kiếm rồi cuộn
 * tới tiêu đề mục đó; cuộn tay → mục đang sáng đổi theo tiêu đề đang đọc (scroll-spy).
 */
export function useSectionRail<T extends string>({
  initialTab,
  clearQuery,
  skipScroll,
}: {
  initialTab: T;
  clearQuery: () => void;
  /** Mục không có khung cuộn riêng (vd tab GIF của sticker picker) — bỏ qua cuộn tới. */
  skipScroll?: (name: T) => boolean;
}) {
  const [tab, setTab] = useState<T>(initialTab);
  const scrollRef = useRef<HTMLDivElement>(null);

  function jumpTo(name: T) {
    clearQuery();
    setTab(name);
    if (skipScroll?.(name)) return;
    // Chờ commit rồi mới cuộn: đang tìm kiếm thì danh sách mục chỉ được render lại sau đó.
    requestAnimationFrame(() => {
      const container = scrollRef.current;
      if (!container) return;
      const node = container.querySelector<HTMLElement>(`[data-section="${name}"]`);
      container.scrollTop = node?.offsetTop ?? 0;
    });
  }

  /** `skip`: không có khung cuộn đang hiện (vd đang ở tab GIF) — không đọc vị trí cuộn. */
  function syncActive(defaultTab: T, skip?: boolean) {
    if (skip) return;
    const container = scrollRef.current;
    if (!container) return;
    const top = container.scrollTop + 4;
    let current: T = defaultTab;
    for (const node of container.querySelectorAll<HTMLElement>('[data-section]')) {
      if (node.offsetTop <= top) current = node.dataset.section as T;
    }
    if (current !== tab) setTab(current);
  }

  return { tab, setTab, scrollRef, jumpTo, syncActive };
}
