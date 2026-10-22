'use client';

import { PingModal } from '@/components/ui/ping-modal';
import { PingInput } from '@/components/ui/ping-input';
import { PingEmpty, PING_EMPTY_IMAGE_SIMPLE } from '@/components/ui/ping-empty';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'use-intl';

/**
 * Quick switcher (TF.5): mở bằng Ctrl/Cmd+K, tìm server/channel, Enter để đi.
 * Phiên bản đầu: chỉ nhận query và gọi onNavigate; dữ liệu thật sẽ nối ở TF.6+.
 */
export interface QuickSwitcherItem {
  id: string;
  label: string;
  href: string;
  group?: string;
}

export interface QuickSwitcherProps {
  items: QuickSwitcherItem[];
}

export function QuickSwitcher({ items }: QuickSwitcherProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const router = useRouter();
  const t = useTranslations('common');

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const filtered = items.filter((i) => i.label.toLowerCase().includes(query.toLowerCase()));

  const navigate = useCallback(
    (href: string) => {
      setOpen(false);
      setQuery('');
      router.push(href);
    },
    [router],
  );

  return (
    <>
      <PingModal
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        title="Chuyển nhanh (Ctrl/Cmd+K)"
        destroyOnHidden
      >
        <PingInput
          placeholder="Tìm server hoặc channel…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onPressEnter={() => {
            if (filtered[0]) navigate(filtered[0].href);
          }}
          data-testid="quick-switcher-input"
        />
        <ul
          style={{ listStyle: 'none', padding: 0, marginTop: 8, maxHeight: 320, overflow: 'auto' }}
        >
          {filtered.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => navigate(item.href)}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  padding: '6px 8px',
                  border: 'none',
                  background: 'transparent',
                  cursor: 'pointer',
                }}
              >
                {item.group ? (
                  <span style={{ opacity: 0.6, marginRight: 6 }}>{item.group} /</span>
                ) : null}
                {item.label}
              </button>
            </li>
          ))}
          {filtered.length === 0 ? (
            <li>
              <PingEmpty description={t('noResults')} image={PING_EMPTY_IMAGE_SIMPLE} />
            </li>
          ) : null}
        </ul>
      </PingModal>
    </>
  );
}
