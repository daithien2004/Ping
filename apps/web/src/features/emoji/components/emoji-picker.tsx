'use client';

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

/** Chuẩn hóa chuỗi tìm kiếm: bỏ dấu tiếng Việt để "cuoi" cũng trúng "cười". */
function foldVi(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

export function matchesSearch(entry: EmojiEntry, query: string): boolean {
  const q = foldVi(query.trim().toLowerCase());
  if (q === '') return true;
  return (
    entry.keywords.some((word) => foldVi(word.toLowerCase()).includes(q)) ||
    entry.shortcode.includes(q.replace(/:/g, ''))
  );
}

/**
 * Lưới emoji picker (TG.23, ADR-0057 — hình do font hệ thống). Điều hướng bàn phím: Tab vào
 * lưới, mũi tên di chuyển, Enter chọn. Skin tone áp modifier Fitzpatrick cho emoji hỗ trợ.
 */
export function EmojiPicker({ onPick }: { onPick: (unicode: string) => void }) {
  const t = useTranslations('emoji');
  const [query, setQuery] = useState('');
  const [group, setGroup] = useState<EmojiGroup | 'recent'>('recent');
  const [tone, setTone] = useState(0); // 0 = mặc định; 1-5 = Fitzpatrick modifier
  // localStorage chỉ đọc được ở client — lazy initializer của useState chạy đúng một lần
  // khi mount (client), không cần effect và không vi phạm purity.
  const [recent, setRecent] = useState<string[]>(() =>
    typeof window === 'undefined' ? [] : loadRecent(),
  );
  const gridRef = useRef<HTMLDivElement>(null);

  const visible = useMemo(() => {
    // Có truy vấn → tìm trên TOÀN BỘ dataset bất kể nhóm đang chọn (không ai muốn đọc
    // "Không tìm thấy" chỉ vì đang đứng nhầm tab); rỗng → hiển thị theo nhóm.
    if (query.trim() !== '') {
      return EMOJI_DATA.filter((entry) => matchesSearch(entry, query));
    }
    if (group === 'recent') {
      return recent
        .map((unicode) => EMOJI_DATA.find((entry) => entry.unicode === unicode))
        .filter((entry): entry is EmojiEntry => entry !== undefined);
    }
    return EMOJI_DATA.filter((entry) => entry.group === group);
  }, [group, query, recent]);

  function pick(entry: EmojiEntry, toneIndex: number) {
    const unicode =
      entry.tone && toneIndex > 0 ? entry.unicode + SKIN_MODIFIERS[toneIndex - 1] : entry.unicode;
    const next = [unicode, ...recent.filter((item) => item !== unicode)].slice(0, RECENT_MAX);
    setRecent(next);
    saveRecent(next);
    onPick(unicode);
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
        {(['recent', ...EMOJI_GROUPS] as const).map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={group === name}
            onClick={() => setGroup(name)}
            className={`rounded px-2 py-0.5 text-xs transition-colors ${
              group === name
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-accent'
            }`}
          >
            {groupLabels[name]}
          </button>
        ))}
      </div>
      {visible.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">{t('noResults')}</p>
      ) : (
        <div
          ref={gridRef}
          role="grid"
          aria-label={groupLabels[group]}
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
