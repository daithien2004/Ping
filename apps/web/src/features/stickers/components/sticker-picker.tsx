'use client';
import type { StickerDto } from '@ping/shared';
import { useMemo, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';
import { useStickers, flattenStickers } from '../hooks';
import { pushRecentSticker, saveRecentStickers, stickerMatchesSearch } from '../sticker-utils';
import { PingInput } from '@/components/ui/ping-input';

export type StickerTab = 'recent' | 'system' | 'server';

/**
 * Sticker picker (TG.22, ADR-0067): ba tab — Gần đây / Hệ thống / Server — tìm theo tên và
 * thẻ (không dấu), lưới điều hướng bằng mũi tên, Enter gửi. Bấm một sticker là GỬI ngay
 * (tin `kind='sticker'`), không chèn vào ô soạn.
 */
export function StickerPicker({
  serverId,
  recent,
  onPick,
}: {
  serverId: string;
  /** Danh sách id gần đây do composer giữ state (để picker render lại khi chọn). */
  recent: string[];
  onPick: (sticker: StickerDto) => void;
}) {
  const t = useTranslations('stickers');
  const { data, isPending } = useStickers(serverId);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<StickerTab>('recent');
  const gridRef = useRef<HTMLDivElement>(null);

  const stickers = useMemo(() => flattenStickers(data), [data]);
  const byId = useMemo(() => new Map(stickers.map((sticker) => [sticker.id, sticker])), [stickers]);
  const systemStickers = useMemo(
    () => (data?.packs ?? []).flatMap((pack) => (pack.serverId === null ? pack.stickers : [])),
    [data],
  );
  const serverStickers = useMemo(
    () => (data?.packs ?? []).flatMap((pack) => (pack.serverId !== null ? pack.stickers : [])),
    [data],
  );

  const visible = useMemo(() => {
    // Có truy vấn → tìm trên TOÀN BỘ sticker của server (kể cả hệ thống), như emoji picker.
    if (query.trim() !== '') {
      return stickers.filter((sticker) => stickerMatchesSearch(sticker, query));
    }
    if (tab === 'recent') {
      return recent
        .map((id) => byId.get(id))
        .filter((sticker): sticker is StickerDto => sticker !== undefined);
    }
    return tab === 'system' ? systemStickers : serverStickers;
  }, [query, tab, recent, byId, stickers, systemStickers, serverStickers]);

  function pick(sticker: StickerDto) {
    saveRecentStickers(pushRecentSticker(recent, sticker.id));
    onPick(sticker);
  }

  function onGridKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    const buttons = Array.from(
      gridRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [],
    );
    const index = buttons.indexOf(event.currentTarget);
    if (index < 0) return;
    const columns = 4;
    const next =
      event.key === 'ArrowRight'
        ? index + 1
        : event.key === 'ArrowLeft'
          ? index - 1
          : event.key === 'ArrowDown'
            ? index + columns
            : event.key === 'ArrowUp'
              ? index - columns
              : undefined;
    event.preventDefault();
    if (next === undefined) return;
    if (next >= 0 && next < buttons.length) buttons[next]!.focus();
  }

  const tabLabels: Record<StickerTab, string> = {
    recent: t('tabRecent'),
    system: t('tabSystem'),
    server: t('tabServer'),
  };

  return (
    <div
      className="flex w-80 flex-col gap-2 rounded-lg border bg-popover p-2 shadow-md"
      data-testid="sticker-picker"
    >
      <PingInput
        aria-label={t('search')}
        placeholder={t('searchPlaceholder')}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        data-testid="sticker-search"
      />
      <div role="tablist" aria-label={t('tabsLabel')} className="flex gap-1">
        {(['recent', 'system', 'server'] as const).map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            onClick={() => setTab(name)}
            className={`rounded px-2 py-0.5 text-xs transition-colors ${
              tab === name
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-accent'
            }`}
          >
            {tabLabels[name]}
          </button>
        ))}
      </div>
      {isPending ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t('loading')}</p>
      ) : visible.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t('noResults')}</p>
      ) : (
        <div
          ref={gridRef}
          role="grid"
          aria-label={tabLabels[tab]}
          className="grid max-h-56 grid-cols-4 gap-0.5 overflow-y-auto"
        >
          {visible.map((sticker) => (
            <button
              key={sticker.id}
              type="button"
              role="gridcell"
              title={sticker.name}
              aria-label={t('pickSticker', { name: sticker.name })}
              onClick={() => pick(sticker)}
              onKeyDown={onGridKeyDown}
              data-testid="sticker-option"
              className="rounded p-1.5 transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
            >
              <img
                src={sticker.url}
                alt=""
                width={sticker.width ?? undefined}
                height={sticker.height ?? undefined}
                loading="lazy"
                className="mx-auto h-16 w-16 object-contain"
              />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
