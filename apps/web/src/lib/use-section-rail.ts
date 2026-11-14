import { useRef, useState } from 'react';

export function useSectionRail<T extends string>({
  initialTab,
  clearQuery,
  skipScroll,
}: {
  initialTab: T;
  clearQuery: () => void;
  skipScroll?: (name: T) => boolean;
}) {
  const [tab, setTab] = useState<T>(initialTab);
  const scrollRef = useRef<HTMLDivElement>(null);

  function jumpTo(name: T) {
    clearQuery();
    setTab(name);
    if (skipScroll?.(name)) return;
    requestAnimationFrame(() => {
      const container = scrollRef.current;
      if (!container) return;
      const node = container.querySelector<HTMLElement>(`[data-section="${name}"]`);
      container.scrollTop = node?.offsetTop ?? 0;
    });
  }

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
