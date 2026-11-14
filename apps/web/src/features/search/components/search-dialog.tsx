'use client';

import dynamic from 'next/dynamic';
import { Search } from 'lucide-react';
import { Suspense, useState } from 'react';
import { useTranslations } from 'use-intl';

const LazySearchModal = dynamic(
  () => import('./search-modal').then((module) => module.SearchModal),
  { ssr: false },
);

/**
 * Nút mở tìm kiếm tin nhắn trong server (T4.6, ADR-0045). Trigger nằm ở header kênh; hộp
 * thoại tách thành chunk riêng để không nằm trong bundle ban đầu.
 *
 * Ô tìm kiếm 240×32 như Discord ở màn rộng; dưới `lg` thu về nút icon để header 375 px không
 * tràn — vẫn một nút nên tên tiếp cận không đổi.
 */
export function SearchDialog({ serverId }: { serverId: string }) {
  const t = useTranslations('search');
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        aria-label={t('open')}
        aria-expanded={open}
        data-slot="search"
        onClick={() => setOpen(true)}
        className="flex h-8 w-8 shrink-0 items-center justify-center gap-1.5 rounded-md bg-field px-0 text-sm text-muted-foreground transition-colors hover:text-foreground focus-ring lg:max-w-61 lg:min-w-24 lg:flex-1 lg:shrink lg:justify-start lg:px-2"
      >
        <Search className="size-4 shrink-0" />
        <span className="hidden min-w-0 truncate lg:inline">{t('short')}</span>
      </button>
      {open && (
        <Suspense fallback={null}>
          <LazySearchModal serverId={serverId} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
