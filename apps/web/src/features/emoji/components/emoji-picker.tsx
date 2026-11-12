'use client';

import type { CustomEmojiDto } from '@ping/shared';
import {
  Gamepad2,
  Hand,
  History,
  Lightbulb,
  PawPrint,
  Plane,
  Search,
  Smile,
  Sparkles,
  UtensilsCrossed,
  Users,
} from 'lucide-react';
import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslations } from 'use-intl';
import { PingInput } from '@/components/ui/ping-input';
import { PingPopover } from '@/components/ui/ping-popover';
import { emojiInsertToken, emojiMatchesSearch } from '@/features/emojis/emoji-utils';
import { useEmojis } from '@/features/emojis/hooks';
import { profileImageUrl } from '@/features/profile/hooks';

import { loadRecentEmoji, rememberEmoji } from '../recent';

import {
  EMOJI_DATA,
  EMOJI_GROUPS,
  SKIN_MODIFIERS,
  type EmojiEntry,
  type EmojiGroup,
} from '../data';
import { foldVi } from '../fold-vi';
// Tái dùng từ nơi khác (sticker picker TG.22): re-export giữ đường import cũ.
export { foldVi };

export function matchesSearch(entry: EmojiEntry, query: string): boolean {
  const q = foldVi(query.trim().toLowerCase());
  if (q === '') return true;
  return (
    entry.keywords.some((word) => foldVi(word.toLowerCase()).includes(q)) ||
    entry.shortcode.includes(q.replace(/:/g, ''))
  );
}

/** Mục trong thanh chọn bên trái: 'server' chỉ xuất hiện khi có `serverId` (TG.24). */
type EmojiTab = EmojiGroup | 'recent' | 'server';

/** Icon cho thanh mục — Discord dùng icon dọc bên trái, nhãn chữ ở title/aria. */
const TAB_ICONS: Record<EmojiTab, ReactNode> = {
  recent: <History className="size-4" />,
  smileys: <Smile className="size-4" />,
  gestures: <Hand className="size-4" />,
  people: <Users className="size-4" />,
  animals: <PawPrint className="size-4" />,
  food: <UtensilsCrossed className="size-4" />,
  activities: <Gamepad2 className="size-4" />,
  travel: <Plane className="size-4" />,
  objects: <Lightbulb className="size-4" />,
  server: <Sparkles className="size-4" />,
};

/** Lưới 9 cột như Discord; cũng là bước nhảy của ArrowUp/ArrowDown. */
const EMOJI_COLUMNS = 9;

/**
 * Emoji picker (TG.23, ADR-0057 — hình do font hệ thống; TG.24 thêm mục "Của server").
 * Bố cục theo Discord: ô tìm kiếm trên cùng, thanh icon dọc bên trái để nhảy giữa các mục,
 * danh sách cuộn có tiêu đề từng mục, chân picker hiện emoji đang trỏ và nút tông da.
 * Mục "server" chỉ có khi biết `serverId`; chọn emoji server gọi `onPickCustom` với token.
 */
export function EmojiPicker({
  onPick,
  serverId,
  onPickCustom,
}: {
  onPick: (unicode: string) => void;
  /** Server hiện tại — có thì hiện mục emoji tùy chỉnh của server (TG.24). */
  serverId?: string;
  /** Chọn emoji server → nhận token `:ten:<id>` để chèn vào nội dung/reaction. */
  onPickCustom?: (token: string) => void;
}) {
  const t = useTranslations('emoji');
  const tc = useTranslations('common');
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<EmojiTab>('recent');
  const [tone, setTone] = useState(0); // 0 = mặc định; 1-5 = Fitzpatrick modifier
  const [toneOpen, setToneOpen] = useState(false);
  const [hovered, setHovered] = useState<{
    glyph?: string;
    image?: string;
    label: string;
  } | null>(null);
  // localStorage chỉ đọc được ở client — lazy initializer của useState chạy đúng một lần
  // khi mount (client), không cần effect và không vi phạm purity.
  const [recent, setRecent] = useState<string[]>(() =>
    typeof window === 'undefined' ? [] : loadRecentEmoji(),
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  // Emoji server (TG.24): cùng query với renderer và màn quản trị (cache chia sẻ, event
  // `expressions.updated` invalidate — mục server tự cập nhật khi có emoji mới).
  const { data: emojiData, isError, refetch, isFetching } = useEmojis(serverId ?? '');
  const serverEmojis = useMemo(() => emojiData?.emojis ?? [], [emojiData]);

  const searching = query.trim() !== '';
  const recentEntries = useMemo(
    () =>
      recent
        .map((unicode) => EMOJI_DATA.find((entry) => entry.unicode === unicode))
        .filter((entry): entry is EmojiEntry => entry !== undefined),
    [recent],
  );
  // Có truy vấn → tìm trên TOÀN BỘ dataset (hệ thống + server), như Discord.
  const unicodeResults = useMemo(
    () => (searching ? EMOJI_DATA.filter((entry) => matchesSearch(entry, query)) : []),
    [searching, query],
  );
  const customResults = useMemo(
    () =>
      searching && serverId ? serverEmojis.filter((emoji) => emojiMatchesSearch(emoji, query)) : [],
    [searching, serverId, serverEmojis, query],
  );

  function pick(entry: EmojiEntry) {
    const unicode =
      entry.tone && tone > 0 ? entry.unicode + SKIN_MODIFIERS[tone - 1] : entry.unicode;
    setRecent(rememberEmoji(unicode));
    onPick(unicode);
  }

  function pickCustom(emoji: CustomEmojiDto) {
    // "Gần đây" chỉ theo dõi emoji hệ thống (unicode); emoji server chèn thẳng token.
    onPickCustom?.(emojiInsertToken(emoji));
  }

  /** Bấm icon bên trái: bỏ tìm kiếm rồi cuộn tới tiêu đề mục đó (kiểu Discord). */
  function jumpTo(name: EmojiTab) {
    setQuery('');
    setTab(name);
    // Chờ commit rồi mới cuộn: đang tìm kiếm thì danh sách mục chỉ được render lại sau đó.
    requestAnimationFrame(() => {
      const container = scrollRef.current;
      if (!container) return;
      const node = container.querySelector<HTMLElement>(`[data-section="${name}"]`);
      container.scrollTop = node?.offsetTop ?? 0;
    });
  }

  /** Icon đang sáng theo mục đang đọc khi cuộn (Discord tô sáng thanh trái). */
  function syncActive() {
    const container = scrollRef.current;
    if (!container) return;
    const top = container.scrollTop + 4;
    let current: EmojiTab = 'recent';
    for (const node of container.querySelectorAll<HTMLElement>('[data-section]')) {
      if (node.offsetTop <= top) current = node.dataset.section as EmojiTab;
    }
    if (current !== tab) setTab(current);
  }

  function onGridKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    // Chỉ điều hướng trong lưới hiện tại — mỗi mục là một lưới riêng.
    const grid = event.currentTarget.closest('[data-grid]');
    const buttons = Array.from(grid?.querySelectorAll<HTMLButtonElement>('button') ?? []);
    const index = buttons.indexOf(event.currentTarget);
    if (index < 0) return;
    const next =
      event.key === 'ArrowRight'
        ? index + 1
        : event.key === 'ArrowLeft'
          ? index - 1
          : event.key === 'ArrowDown'
            ? index + EMOJI_COLUMNS
            : event.key === 'ArrowUp'
              ? index - EMOJI_COLUMNS
              : undefined;
    event.preventDefault();
    if (next === undefined) return;
    if (next >= 0 && next < buttons.length) buttons[next]!.focus();
  }

  const groupLabels: Record<EmojiGroup | 'recent', string> = {
    recent: t('groupRecent'),
    smileys: t('groupSmileys'),
    gestures: t('groupGestures'),
    people: t('groupPeople'),
    animals: t('groupAnimals'),
    food: t('groupFood'),
    activities: t('groupActivities'),
    travel: t('groupTravel'),
    objects: t('groupObjects'),
  };
  const tabLabels: Record<EmojiTab, string> = { ...groupLabels, server: t('tabServerEmoji') };
  const railTabs: EmojiTab[] = serverId
    ? ['recent', 'server', ...EMOJI_GROUPS]
    : ['recent', ...EMOJI_GROUPS];
  // Mục "Gần đây" rỗng thì ẩn, như Discord (chưa ai dùng emoji nào).
  const sections = railTabs.filter((name) => name !== 'recent' || recentEntries.length > 0);
  const resultCount = unicodeResults.length + customResults.length;

  return (
    <div
      className="flex min-h-0 w-[420px] max-w-full flex-col gap-2 overflow-hidden p-2"
      data-testid="emoji-picker"
    >
      <PingInput
        aria-label={t('search')}
        placeholder={t('searchPlaceholder')}
        prefix={<Search className="size-4 text-muted-foreground" aria-hidden />}
        allowClear
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        data-testid="emoji-search"
      />
      <div className="flex min-h-0 grow gap-1">
        <div
          role="tablist"
          aria-orientation="vertical"
          aria-label={t('groupsLabel')}
          className="flex w-9 shrink-0 flex-col items-center gap-0.5 border-r border-border/60 pr-1"
        >
          {railTabs.map((name) => (
            <button
              key={name}
              type="button"
              role="tab"
              title={tabLabels[name]}
              aria-label={tabLabels[name]}
              aria-selected={!searching && tab === name}
              onClick={() => jumpTo(name)}
              className={`grid size-7 shrink-0 place-items-center rounded-md transition-colors ${
                !searching && tab === name
                  ? 'bg-accent text-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              }`}
            >
              {TAB_ICONS[name]}
            </button>
          ))}
        </div>
        <div
          ref={scrollRef}
          onScroll={syncActive}
          className="relative h-80 max-h-full min-w-0 flex-1 overflow-y-auto pr-1"
        >
          {searching ? (
            resultCount === 0 ? (
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
                  className="grid grid-cols-9 justify-items-center gap-0.5"
                >
                  {unicodeResults.map((entry) => (
                    <button
                      key={entry.unicode}
                      type="button"
                      role="gridcell"
                      title={`:${entry.shortcode}:`}
                      aria-label={t('pickEmoji', { name: entry.keywords[0]! })}
                      onClick={() => pick(entry)}
                      onKeyDown={onGridKeyDown}
                      onMouseEnter={() =>
                        setHovered({
                          glyph: entry.unicode,
                          label: `:${entry.shortcode}:`,
                        })
                      }
                      onFocus={() =>
                        setHovered({
                          glyph: entry.unicode,
                          label: `:${entry.shortcode}:`,
                        })
                      }
                      className="grid size-9 place-items-center rounded-md text-xl leading-none transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                    >
                      {entry.unicode}
                    </button>
                  ))}
                  {customResults.map((emoji) => (
                    <button
                      key={emoji.id}
                      type="button"
                      role="gridcell"
                      title={`:${emoji.name}:`}
                      aria-label={t('pickCustomEmoji', { name: emoji.name })}
                      onClick={() => pickCustom(emoji)}
                      onKeyDown={onGridKeyDown}
                      onMouseEnter={() =>
                        setHovered({
                          image: profileImageUrl(emoji.previewUrl || emoji.url),
                          label: `:${emoji.name}:`,
                        })
                      }
                      onFocus={() =>
                        setHovered({
                          image: profileImageUrl(emoji.previewUrl || emoji.url),
                          label: `:${emoji.name}:`,
                        })
                      }
                      data-testid="custom-emoji-option"
                      className="grid size-9 place-items-center rounded-md transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                    >
                      {/* previewUrl tĩnh nếu có — lưới nhẹ; bản động xem ở tin nhắn. */}
                      <img
                        src={profileImageUrl(emoji.previewUrl || emoji.url)}
                        alt=""
                        loading="lazy"
                        className="size-7 object-contain"
                      />
                    </button>
                  ))}
                </div>
              </section>
            )
          ) : (
            sections.map((name) => (
              <section key={name} data-section={name} aria-label={tabLabels[name]}>
                <h3 className="px-1 pt-1 pb-0.5 text-xs font-semibold text-muted-foreground">
                  {tabLabels[name]}
                </h3>
                {name === 'server' ? (
                  isError ? (
                    <div
                      role="alert"
                      className="flex items-center gap-2 px-1 py-2 text-xs text-destructive"
                    >
                      <span>{t('serverEmojisLoadFailed')}</span>
                      <button
                        type="button"
                        disabled={isFetching}
                        onClick={() => void refetch()}
                        className="rounded border px-2 py-0.5 text-xs text-foreground transition-colors hover:bg-accent disabled:opacity-50"
                      >
                        {tc('retry')}
                      </button>
                    </div>
                  ) : serverEmojis.length === 0 ? (
                    <p className="px-1 py-2 text-xs text-muted-foreground">{t('noServerEmojis')}</p>
                  ) : (
                    <div
                      role="grid"
                      aria-label={t('tabServerEmoji')}
                      data-grid
                      className="grid grid-cols-9 justify-items-center gap-0.5"
                    >
                      {serverEmojis.map((emoji) => (
                        <button
                          key={emoji.id}
                          type="button"
                          role="gridcell"
                          title={`:${emoji.name}:`}
                          aria-label={t('pickCustomEmoji', { name: emoji.name })}
                          onClick={() => pickCustom(emoji)}
                          onKeyDown={onGridKeyDown}
                          onMouseEnter={() =>
                            setHovered({
                              image: profileImageUrl(emoji.previewUrl || emoji.url),
                              label: `:${emoji.name}:`,
                            })
                          }
                          onFocus={() =>
                            setHovered({
                              image: profileImageUrl(emoji.previewUrl || emoji.url),
                              label: `:${emoji.name}:`,
                            })
                          }
                          data-testid="custom-emoji-option"
                          className="grid size-9 place-items-center rounded-md transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                        >
                          {/* previewUrl tĩnh nếu có — lưới nhẹ; bản động xem ở tin nhắn. */}
                          <img
                            src={profileImageUrl(emoji.previewUrl || emoji.url)}
                            alt=""
                            loading="lazy"
                            className="size-7 object-contain"
                          />
                        </button>
                      ))}
                    </div>
                  )
                ) : (
                  <div
                    role="grid"
                    aria-label={tabLabels[name]}
                    data-grid
                    className="grid grid-cols-9 justify-items-center gap-0.5"
                  >
                    {(name === 'recent'
                      ? recentEntries
                      : EMOJI_DATA.filter((entry) => entry.group === name)
                    ).map((entry) => (
                      <button
                        key={entry.unicode}
                        type="button"
                        role="gridcell"
                        title={`:${entry.shortcode}:`}
                        aria-label={t('pickEmoji', { name: entry.keywords[0]! })}
                        onClick={() => pick(entry)}
                        onKeyDown={onGridKeyDown}
                        onMouseEnter={() =>
                          setHovered({
                            glyph: entry.unicode,
                            label: `:${entry.shortcode}:`,
                          })
                        }
                        onFocus={() =>
                          setHovered({
                            glyph: entry.unicode,
                            label: `:${entry.shortcode}:`,
                          })
                        }
                        className="grid size-9 place-items-center rounded-md text-xl leading-none transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                      >
                        {entry.unicode}
                      </button>
                    ))}
                  </div>
                )}
              </section>
            ))
          )}
        </div>
      </div>
      <div className="flex h-9 items-center justify-between gap-2 border-t border-border pt-1">
        <span className="flex min-w-0 items-center gap-2 px-1">
          {hovered && (
            <>
              {hovered.image ? (
                <img src={hovered.image} alt="" className="size-5 object-contain" />
              ) : (
                <span className="text-lg leading-none">{hovered.glyph}</span>
              )}
              <span className="truncate text-xs text-muted-foreground">{hovered.label}</span>
            </>
          )}
        </span>
        <PingPopover
          trigger="click"
          placement="topRight"
          open={toneOpen}
          onOpenChange={setToneOpen}
          content={
            <div className="flex items-center gap-1" role="group" aria-label={t('skinTone')}>
              {[0, 1, 2, 3, 4, 5].map((index) => (
                <button
                  key={index}
                  type="button"
                  aria-label={t('skinToneOption', { n: index })}
                  aria-pressed={tone === index}
                  onClick={() => {
                    setTone(index);
                    setToneOpen(false);
                  }}
                  className={`grid size-7 place-items-center rounded-full text-base leading-none transition-colors ${
                    tone === index ? 'bg-primary/15 ring-2 ring-primary' : 'hover:bg-accent'
                  }`}
                >
                  {index === 0 ? '✋' : `✋${SKIN_MODIFIERS[index - 1]}`}
                </button>
              ))}
            </div>
          }
        >
          <button
            type="button"
            aria-label={t('skinTone')}
            title={t('skinTone')}
            className="grid size-8 shrink-0 place-items-center rounded-md text-lg leading-none transition-colors hover:bg-accent"
          >
            {tone === 0 ? '✋' : `✋${SKIN_MODIFIERS[tone - 1]}`}
          </button>
        </PingPopover>
      </div>
    </div>
  );
}
