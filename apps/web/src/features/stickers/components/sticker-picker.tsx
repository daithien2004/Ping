'use client';
import type { GifPayload, StickerDto } from '@ping/shared';
import { Film, History, Search, Sparkles, Sticker as StickerIcon } from 'lucide-react';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'use-intl';
import { useStickers, flattenStickers } from '../hooks';
import { pushRecentSticker, saveRecentStickers, stickerMatchesSearch } from '../sticker-utils';
import { profileImageUrl } from '@/features/profile/hooks';
import { useGifTrending } from '@/features/gifs/hooks';
import { GifPanel } from '@/features/gifs/components/gif-panel';
import { PingInput } from '@/components/ui/ping-input';

export type StickerTab = 'recent' | 'system' | 'server' | 'gif';

/** Icon cho thanh mục dọc bên trái — cùng kiểu emoji picker, nhãn chữ ở title/aria. */
const TAB_ICONS: Record<StickerTab, ReactNode> = {
  recent: <History className="size-4" />,
  system: <StickerIcon className="size-4" />,
  server: <Sparkles className="size-4" />,
  gif: <Film className="size-4" />,
};

/**
 * Sticker picker (TG.22, ADR-0067; tab GIF thêm bởi TG.25 ADR-0069). Bố cục theo Discord:
 * ô tìm kiếm trên cùng, thanh icon dọc bên trái (Gần đây / Hệ thống / Của server / GIF),
 * danh sách cuộn có tiêu đề từng gói sticker. Bấm một sticker/GIF là GỬI ngay
 * (tin `kind='sticker'`/`kind='gif'`), không chèn vào ô soạn. Tab GIF chuyển hẳn sang panel GIF
 * và dùng chung ô tìm kiếm (debounce trong panel).
 */
export function StickerPicker({
  serverId,
  recent,
  recentGifs,
  onPick,
  onPickGif,
}: {
  serverId: string;
  /** Danh sách id gần đây do composer giữ state (để picker render lại khi chọn). */
  recent: string[];
  /** TG.25: GIF gần đây của user (state ở composer vì khóa localStorage theo user). */
  recentGifs: GifPayload[];
  onPick: (sticker: StickerDto) => void;
  /** TG.25: chọn GIF trong tab GIF là gửi ngay một tin `kind='gif'` (payload đủ để gửi). */
  onPickGif: (gif: GifPayload) => void;
}) {
  const t = useTranslations('stickers');
  const tg = useTranslations('gifs');
  const tc = useTranslations('common');
  const { data, isPending, isError, refetch, isFetching } = useStickers(serverId);
  // Làm ấm tab GIF ngay khi picker mở: bấm sang tab GIF là ảnh đã có trong cache thay vì
  // chờ request (cache 5 phút, panel GIF dùng lại đúng key này).
  useGifTrending();
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<StickerTab>('recent');
  const scrollRef = useRef<HTMLDivElement>(null);

  const stickers = useMemo(() => flattenStickers(data), [data]);
  const byId = useMemo(() => new Map(stickers.map((sticker) => [sticker.id, sticker])), [stickers]);
  const searching = query.trim() !== '';
  const searchResults = useMemo(
    () => (searching ? stickers.filter((sticker) => stickerMatchesSearch(sticker, query)) : []),
    [searching, stickers, query],
  );
  const recentStickers = useMemo(
    () =>
      recent
        .map((id) => byId.get(id))
        .filter((sticker): sticker is StickerDto => sticker !== undefined),
    [recent, byId],
  );

  function pick(sticker: StickerDto) {
    saveRecentStickers(pushRecentSticker(recent, sticker.id));
    onPick(sticker);
  }

  /** Bấm icon bên trái: bỏ tìm kiếm rồi nhảy tới gói đầu tiên của mục đó (kiểu Discord). */
  function jumpTo(name: StickerTab) {
    setTab(name);
    setQuery('');
    if (name === 'gif') return;
    // Chờ commit rồi mới cuộn: từ tab GIF, khung cuộn của danh sách sticker mới được mount.
    requestAnimationFrame(() => {
      const container = scrollRef.current;
      if (!container) return;
      const node = container.querySelector<HTMLElement>(`[data-section="${name}"]`);
      container.scrollTop = node?.offsetTop ?? 0;
    });
  }

  /** Icon đang sáng theo gói đang đọc khi cuộn. */
  function syncActive() {
    if (tab === 'gif') return;
    const container = scrollRef.current;
    if (!container) return;
    const top = container.scrollTop + 4;
    let current: StickerTab = 'recent';
    for (const node of container.querySelectorAll<HTMLElement>('[data-section]')) {
      if (node.offsetTop <= top) current = node.dataset.section as StickerTab;
    }
    if (current !== tab) setTab(current);
  }

  function onGridKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    // Chỉ điều hướng trong lưới hiện tại — mỗi gói là một lưới riêng.
    const grid = event.currentTarget.closest('[data-grid]');
    const buttons = Array.from(grid?.querySelectorAll<HTMLButtonElement>('button') ?? []);
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
    gif: tg('tab'),
  };
  const packs = data?.packs ?? [];
  const sections: { key: string; tab: StickerTab; label: string; stickers: StickerDto[] }[] = [
    ...(recentStickers.length > 0
      ? [{ key: 'recent', tab: 'recent' as const, label: t('tabRecent'), stickers: recentStickers }]
      : []),
    ...packs
      .filter((pack) => pack.serverId === null)
      .map((pack) => ({
        key: `system-${pack.id}`,
        tab: 'system' as const,
        label: pack.name,
        stickers: pack.stickers,
      })),
    ...packs
      .filter((pack) => pack.serverId !== null)
      .map((pack) => ({
        key: `server-${pack.id}`,
        tab: 'server' as const,
        label: pack.name,
        stickers: pack.stickers,
      })),
  ];

  return (
    <div
      className="flex min-h-0 w-[420px] max-w-full flex-col gap-2 overflow-hidden p-2"
      data-testid="sticker-picker"
    >
      <PingInput
        aria-label={tab === 'gif' ? tg('search') : t('search')}
        placeholder={tab === 'gif' ? tg('searchPlaceholder') : t('searchPlaceholder')}
        prefix={<Search className="size-4 text-muted-foreground" aria-hidden />}
        allowClear
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        data-testid="sticker-search"
      />
      <div className="flex min-h-0 grow gap-1">
        <div
          role="tablist"
          aria-orientation="vertical"
          aria-label={t('tabsLabel')}
          className="flex w-9 shrink-0 flex-col items-center gap-0.5 border-r border-border/60 pr-1"
        >
          {(['recent', 'system', 'server', 'gif'] as const).map((name) => (
            <button
              key={name}
              type="button"
              role="tab"
              title={tabLabels[name]}
              aria-label={tabLabels[name]}
              aria-selected={tab === name}
              onClick={() => jumpTo(name)}
              className={`grid size-8 shrink-0 place-items-center rounded-md transition-colors ${
                tab === name
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              {TAB_ICONS[name]}
            </button>
          ))}
        </div>
        {tab === 'gif' ? (
          // TG.25: panel GIF tự lo loading/rỗng/lỗi 503/ghi công; truy vấn dùng chung ô tìm kiếm
          // phía trên (debounce trong panel), không phụ thuộc trạng thái tải sticker.
          <div className="h-80 max-h-full min-w-0 flex-1 overflow-y-auto pr-1">
            <GifPanel query={query} recentGifs={recentGifs} onPickGif={onPickGif} />
          </div>
        ) : isError ? (
          <div
            role="alert"
            className="flex h-80 max-h-full min-w-0 flex-1 flex-col items-center justify-center gap-2 text-sm text-destructive"
          >
            <p>{t('loadFailed')}</p>
            <button
              type="button"
              disabled={isFetching}
              onClick={() => void refetch()}
              className="rounded border px-2 py-0.5 text-xs text-foreground transition-colors hover:bg-accent disabled:opacity-50"
            >
              {tc('retry')}
            </button>
          </div>
        ) : isPending ? (
          <p className="flex h-80 max-h-full min-w-0 flex-1 items-center justify-center text-sm text-muted-foreground">
            {t('loading')}
          </p>
        ) : (
          <div
            ref={scrollRef}
            onScroll={syncActive}
            className="relative h-80 max-h-full min-w-0 flex-1 overflow-y-auto pr-1"
          >
            {searching ? (
              searchResults.length === 0 ? (
                <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  {t('noResults')}
                </p>
              ) : (
                <section>
                  <h3 className="px-1 pt-1 pb-0.5 text-xs font-semibold text-muted-foreground">
                    {t('searchResults')}
                  </h3>
                  <div
                    role="grid"
                    aria-label={t('searchResults')}
                    data-grid
                    className="grid grid-cols-4 gap-1"
                  >
                    {searchResults.map((sticker) => (
                      <button
                        key={sticker.id}
                        type="button"
                        role="gridcell"
                        title={sticker.name}
                        aria-label={t('pickSticker', { name: sticker.name })}
                        onClick={() => pick(sticker)}
                        onKeyDown={onGridKeyDown}
                        data-testid="sticker-option"
                        className="grid aspect-square place-items-center rounded-md p-1 transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                      >
                        <img
                          src={profileImageUrl(sticker.url)}
                          alt=""
                          width={sticker.width ?? undefined}
                          height={sticker.height ?? undefined}
                          loading="lazy"
                          className="h-full w-full object-contain"
                        />
                      </button>
                    ))}
                  </div>
                </section>
              )
            ) : sections.length === 0 ? (
              <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                {t('noResults')}
              </p>
            ) : (
              sections.map((section) => (
                <section key={section.key} data-section={section.tab} aria-label={section.label}>
                  <h3 className="px-1 pt-1 pb-0.5 text-xs font-semibold text-muted-foreground">
                    {section.label}
                  </h3>
                  <div
                    role="grid"
                    aria-label={section.label}
                    data-grid
                    className="grid grid-cols-4 gap-1"
                  >
                    {section.stickers.map((sticker) => (
                      <button
                        key={sticker.id}
                        type="button"
                        role="gridcell"
                        title={sticker.name}
                        aria-label={t('pickSticker', { name: sticker.name })}
                        onClick={() => pick(sticker)}
                        onKeyDown={onGridKeyDown}
                        data-testid="sticker-option"
                        className="grid aspect-square place-items-center rounded-md p-1 transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                      >
                        <img
                          src={profileImageUrl(sticker.url)}
                          alt=""
                          width={sticker.width ?? undefined}
                          height={sticker.height ?? undefined}
                          loading="lazy"
                          className="h-full w-full object-contain"
                        />
                      </button>
                    ))}
                  </div>
                </section>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
