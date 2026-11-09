'use client';

import {
  useCallback,
  useDeferredValue,
  useId,
  useMemo,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'use-intl';
import { PingModal } from '@/components/ui/ping-modal';
import { PingInput, type PingInputRef } from '@/components/ui/ping-input';
import { PingEmpty } from '@/components/ui/ping-empty';

// Chỉ trình bày: trạng thái mở và dữ liệu do `QuickSwitcherHost` (features/shell) cấp.
export interface QuickSwitcherItem {
  id: string;
  label: string;
  href: string;
  group?: string;
}

export interface QuickSwitcherProps {
  items: QuickSwitcherItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function QuickSwitcher({ items, open, onOpenChange }: QuickSwitcherProps) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const router = useRouter();
  const t = useTranslations('common');
  const tq = useTranslations('quickSwitcher');
  const listId = useId();
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  const filtered = useMemo(
    () => items.filter((item) => item.label.toLowerCase().includes(deferredQuery)),
    [items, deferredQuery],
  );
  const hasResults = filtered.length > 0;
  // `items` có thể co lại khi đang mở: kẹp chỉ số để không trỏ ra ngoài danh sách.
  const current = Math.min(active, filtered.length - 1);

  // Callback ref, không phải ref object + effect: antd mount nội dung modal qua Portal ở commit sau
  // nên ref object còn null lúc effect chạy (focus() thay autoFocus, ADR-0029).
  const focusInput = useCallback((element: PingInputRef | null) => {
    element?.focus();
  }, []);

  function navigate(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  // Giữ focus ở ô nhập và đổi lựa chọn bằng phím (mẫu ARIA combobox).
  function onKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (filtered.length === 0) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive(
        (index) =>
          (Math.min(index, filtered.length - 1) + step + filtered.length) % filtered.length,
      );
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const item = filtered[current];
      if (item) navigate(item.href);
    }
  }

  return (
    <PingModal
      open={open}
      onCancel={() => onOpenChange(false)}
      footer={null}
      title={tq('title')}
      destroyOnHidden
    >
      <PingInput
        ref={focusInput}
        placeholder={tq('placeholder')}
        aria-label={tq('placeholder')}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
        }}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={hasResults}
        aria-controls={hasResults ? listId : undefined}
        aria-activedescendant={filtered[current] ? `${listId}-${filtered[current].id}` : undefined}
        data-testid="quick-switcher-input"
      />
      {hasResults ? (
        <ul
          id={listId}
          role="listbox"
          aria-label={tq('title')}
          className="mt-2 max-h-80 overflow-y-auto"
        >
          {filtered.map((item, index) => (
            <li
              key={item.id}
              id={`${listId}-${item.id}`}
              role="option"
              aria-selected={index === current}
              data-testid="quick-switcher-item"
              className={`cursor-pointer rounded-md px-2 py-1.5 text-sm ${
                index === current ? 'bg-accent text-accent-foreground' : ''
              }`}
              onMouseEnter={() => setActive(index)}
              onClick={() => navigate(item.href)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  navigate(item.href);
                }
              }}
            >
              {item.group ? (
                // Chữ phụ trên nền `accent` chỉ 4,20:1: dùng màu chữ của dòng chọn để giữ AA.
                <span
                  className={`mr-1.5 text-xs ${
                    index === current ? 'text-accent-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {item.group} /
                </span>
              ) : null}
              {item.label}
            </li>
          ))}
        </ul>
      ) : (
        <div role="status" className="mt-2">
          <PingEmpty compact description={t('noResults')} />
        </div>
      )}
    </PingModal>
  );
}
