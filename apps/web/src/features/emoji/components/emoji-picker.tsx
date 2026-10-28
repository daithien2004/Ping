'use client';

import type { CustomEmojiDto } from '@ping/shared';
import {
  EMOJI_DATA,
  EMOJI_GROUPS,
  SKIN_MODIFIERS,
  type EmojiEntry,
  type EmojiGroup,
} from '../data';
import { useMemo, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';
import { PingInput } from '@/components/ui/ping-input';
import { emojiInsertToken, emojiMatchesSearch } from '@/features/emojis/emoji-utils';
import { useEmojis } from '@/features/emojis/hooks';
import { profileImageUrl } from '@/features/profile/hooks';

/** Số emoji tối đa lưu trong "Gần đây" (localStorage). */
const RECENT_MAX = 24;
const RECENT_KEY = 'ping.emoji-recent';

function loadRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

function saveRecent(list: string[]): void {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
  } catch {
    // localStorage đầy/bị chặn: bỏ qua — tính năng gần đây là tiện ích, không phải dữ liệu.
  }
}

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

/** Tab của picker: 'server' chỉ xuất hiện khi có `serverId` (TG.24). */
type EmojiTab = EmojiGroup | 'recent' | 'server';

/**
 * Lưới emoji picker (TG.23, ADR-0057 — hình do font hệ thống). Điều hướng bàn phím: Tab vào
 * lưới, mũi tên di chuyển, Enter chọn. Skin tone áp modifier Fitzpatrick cho emoji hỗ trợ.
 * TG.24 (ADR-0068): có `serverId` → thêm tab "Của server" với emoji tùy chỉnh của server;
 * chọn một emoji server gọi `onPickCustom` với token `:ten:<id>`.
 */
export function EmojiPicker({
  onPick,
  serverId,
  onPickCustom,
}: {
  onPick: (unicode: string) => void;
  /** Server hiện tại — có thì hiện tab "Của server" với emoji tùy chỉnh (TG.24). */
  serverId?: string;
  /** Chọn emoji server → nhận token `:ten:<id>` để chèn vào nội dung/reaction. */
  onPickCustom?: (token: string) => void;
}) {
  const t = useTranslations('emoji');
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<EmojiTab>('recent');
  const [tone, setTone] = useState(0); // 0 = mặc định; 1-5 = Fitzpatrick modifier
  // localStorage chỉ đọc được ở client — lazy initializer của useState chạy đúng một lần
  // khi mount (client), không cần effect và không vi phạm purity.
  const [recent, setRecent] = useState<string[]>(() =>
    typeof window === 'undefined' ? [] : loadRecent(),
  );
  const gridRef = useRef<HTMLDivElement>(null);
  // Emoji server (TG.24): cùng query với renderer và màn quản trị (cache chia sẻ, event
  // `expressions.updated` invalidate — tab tự cập nhật khi có emoji mới).
  const { data: emojiData } = useEmojis(serverId ?? '');
  const serverEmojis = useMemo(() => emojiData?.emojis ?? [], [emojiData]);
  // Tách hai mảng kết quả (hệ thống / server) để TS không hợp nhất kiểu phần tử.
  const serverVisible = useMemo(() => {
    if (tab !== 'server') return [];
    return query.trim() === ''
      ? serverEmojis
      : serverEmojis.filter((emoji) => emojiMatchesSearch(emoji, query));
  }, [tab, query, serverEmojis]);

  const visible = useMemo(() => {
    if (tab === 'server') return [];
    // Có truy vấn → tìm trên TOÀN BỘ dataset bất kể nhóm đang chọn (không ai muốn đọc
    // "Không tìm thấy" chỉ vì đang đứng nhầm tab); rỗng → hiển thị theo nhóm.
    if (query.trim() !== '') {
      return EMOJI_DATA.filter((entry) => matchesSearch(entry, query));
    }
    if (tab === 'recent') {
      return recent
        .map((unicode) => EMOJI_DATA.find((entry) => entry.unicode === unicode))
        .filter((entry): entry is EmojiEntry => entry !== undefined);
    }
    return EMOJI_DATA.filter((entry) => entry.group === tab);
  }, [tab, query, recent]);

  function pick(entry: EmojiEntry, toneIndex: number) {
    const unicode =
      entry.tone && toneIndex > 0 ? entry.unicode + SKIN_MODIFIERS[toneIndex - 1] : entry.unicode;
    const next = [unicode, ...recent.filter((item) => item !== unicode)].slice(0, RECENT_MAX);
    setRecent(next);
    saveRecent(next);
    onPick(unicode);
  }

  function pickCustom(emoji: CustomEmojiDto) {
    // "Gần đây" chỉ theo dõi emoji hệ thống (unicode); emoji server chèn thẳng token.
    onPickCustom?.(emojiInsertToken(emoji));
  }

  function onGridKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    const buttons = Array.from(
      gridRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? [],
    );
    const index = buttons.indexOf(event.currentTarget);
    if (index < 0) return;
    const columns = 8;
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
  // Tab "Của server" (TG.24) chỉ hiện khi biết server (composer và dialog reaction đều có).
  const tabs: EmojiTab[] = serverId
    ? ['recent', 'server', ...EMOJI_GROUPS]
    : ['recent', ...EMOJI_GROUPS];

  return (
    <div
      className="flex w-80 flex-col gap-2 rounded-lg border bg-popover p-2 shadow-md"
      data-testid="emoji-picker"
    >
      <PingInput
        aria-label={t('search')}
        placeholder={t('searchPlaceholder')}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        data-testid="emoji-search"
      />
      <div role="tablist" aria-label={t('groupsLabel')} className="flex flex-wrap gap-1">
        {tabs.map((name) => (
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
      {tab === 'server' ? (
        serverVisible.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            {serverEmojis.length === 0 ? t('noServerEmojis') : t('noResults')}
          </p>
        ) : (
          <div
            ref={gridRef}
            role="grid"
            aria-label={tabLabels[tab]}
            className="grid max-h-56 grid-cols-8 gap-0.5 overflow-y-auto"
          >
            {serverVisible.map((emoji) => (
              <button
                key={emoji.id}
                type="button"
                role="gridcell"
                title={`:${emoji.name}:`}
                aria-label={t('pickCustomEmoji', { name: emoji.name })}
                onClick={() => pickCustom(emoji)}
                onKeyDown={onGridKeyDown}
                data-testid="custom-emoji-option"
                className="rounded p-1 transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
              >
                {/* previewUrl tĩnh nếu có — lưới nhẹ; bản động xem ở tin nhắn. */}
                <img
                  src={profileImageUrl(emoji.previewUrl || emoji.url)}
                  alt=""
                  loading="lazy"
                  className="h-8 w-8 object-contain"
                />
              </button>
            ))}
          </div>
        )
      ) : visible.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t('noResults')}</p>
      ) : (
        <div
          ref={gridRef}
          role="grid"
          aria-label={tabLabels[tab]}
          className="grid max-h-56 grid-cols-8 gap-0.5 overflow-y-auto"
        >
          {visible.map((entry) => (
            <button
              key={entry.unicode}
              type="button"
              role="gridcell"
              title={`:${entry.shortcode}:`}
              aria-label={t('pickEmoji', { name: entry.keywords[0]! })}
              onClick={() => pick(entry, tone)}
              onKeyDown={onGridKeyDown}
              className="rounded p-1 text-xl leading-none transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
            >
              {entry.unicode}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-1" role="group" aria-label={t('skinTone')}>
        <span className="text-xs text-muted-foreground">{t('skinTone')}:</span>
        {[0, 1, 2, 3, 4, 5].map((index) => (
          <button
            key={index}
            type="button"
            aria-label={t('skinToneOption', { n: index })}
            aria-pressed={tone === index}
            onClick={() => setTone(index)}
            className={`h-5 w-5 rounded-full border transition-transform ${
              tone === index ? 'scale-110 border-primary' : 'border-transparent hover:scale-105'
            }`}
          >
            {index === 0 ? '✋' : `✋${SKIN_MODIFIERS[index - 1]}`}
          </button>
        ))}
      </div>
    </div>
  );
}
