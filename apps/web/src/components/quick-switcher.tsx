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
import { PingEmpty, PING_EMPTY_IMAGE_SIMPLE } from '@/components/ui/ping-empty';

/**
 * Quick switcher (TF.5): Ctrl/Cmd+K để tìm server, hội thoại DM hoặc kênh của server đang mở.
 * Component chỉ trình bày — trạng thái mở và dữ liệu do `QuickSwitcherHost` (features/shell)
 * cấp; modal được tải lười ở lần mở đầu tiên (T6.10).
 */
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

  // Modal đã mở mới mount: đưa con trỏ vào ô nhập bằng focus() thay vì autoFocus (ADR-0029).
  // Callback ref (không phải ref object + useEffect): antd mount nội dung modal qua Portal ở
  // commit sau, nên ref object còn null khi effect của component này chạy; callback chỉ chạy
  // đúng lúc phần tử được gắn. Hàm ổn định (useCallback) để không nhận lại ref mỗi lần render.
  const focusInput = useCallback((element: PingInputRef | null) => {
    element?.focus();
  }, []);

  function navigate(href: string) {
    onOpenChange(false);
    router.push(href);
  }

  // Giữ focus ở ô nhập (combobox) và di chuyển lựa chọn bằng phím — đúng mẫu ARIA cho danh sách gợi ý.
  function onKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (filtered.length === 0) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((index) => (index + step + filtered.length) % filtered.length);
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      const item = filtered[active];
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
        aria-expanded
        aria-controls={listId}
        aria-activedescendant={filtered[active] ? `${listId}-${filtered[active].id}` : undefined}
        data-testid="quick-switcher-input"
      />
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
            aria-selected={index === active}
            data-testid="quick-switcher-item"
            className={`cursor-pointer rounded-md px-2 py-1.5 text-sm ${
              index === active ? 'bg-accent text-accent-foreground' : ''
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
              // Dòng đang chọn nền `accent`: chữ phụ trên nền đó chỉ 4,20:1, nên dùng luôn màu
              // chữ của dòng chọn để giữ AA.
              <span
                className={`mr-1.5 text-xs ${
                  index === active ? 'text-accent-foreground' : 'text-muted-foreground'
                }`}
              >
                {item.group} /
              </span>
            ) : null}
            {item.label}
          </li>
        ))}
        {filtered.length === 0 ? (
          <li>
            <PingEmpty description={t('noResults')} image={PING_EMPTY_IMAGE_SIMPLE} />
          </li>
        ) : null}
      </ul>
    </PingModal>
  );
}
