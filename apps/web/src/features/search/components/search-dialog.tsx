'use client';

import dynamic from 'next/dynamic';
import { Search } from 'lucide-react';
import { Suspense, useState } from 'react';
import { useTranslations } from 'use-intl';
import { Button } from '@/components/ui/button';

// Tải lười: chỉ nạp chunk hộp thoại tìm kiếm ở lần mở đầu tiên (T6.10).
const LazySearchModal = dynamic(
  () => import('./search-modal').then((module) => module.SearchModal),
  { ssr: false },
);

/**
 * Nút mở tìm kiếm tin nhắn trong server (T4.6, ADR-0045). Trigger nằm ở header kênh; hộp
 * thoại tách thành chunk riêng để không nằm trong bundle ban đầu.
 */
export function SearchDialog({ serverId }: { serverId: string }) {
  const t = useTranslations('search');
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t('open')}
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Search />
      </Button>
      {open && (
        <Suspense fallback={null}>
          <LazySearchModal serverId={serverId} onClose={() => setOpen(false)} />
        </Suspense>
      )}
    </>
  );
}
