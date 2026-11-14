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
import { useMemo, useState, useSyncExternalStore, type KeyboardEvent, type ReactNode } from 'react';
import { useTranslations } from 'use-intl';
import { PingInput } from '@/components/ui/ping-input';
import { PingPopover } from '@/components/ui/ping-popover';
import { emojiInsertToken, emojiMatchesSearch } from '@/features/emojis/emoji-utils';
import { useEmojis } from '@/features/emojis/hooks';
import { foldVi } from '@/lib/fold-vi';
import { gridArrowKeyIndex } from '@/lib/grid-arrow-key-index';
import { useSectionRail } from '@/lib/use-section-rail';
import {
  EMOJI_DATA,
  EMOJI_GROUPS,
  SKIN_MODIFIERS,
  type EmojiEntry,
  type EmojiGroup,
} from '../../data';
import {
  recentEmojiSnapshot,
  rememberEmoji,
  serverRecentEmojiSnapshot,
  subscribeRecentEmoji,
} from '../../recent';
import { CustomEmojiButton } from './custom-emoji-button';
import { EmojiButton } from './emoji-button';

export function matchesSearch(entry: EmojiEntry, query: string): boolean {
  const q = foldVi(query.trim().toLowerCase());
  if (q === '') return true;
  return (
    entry.keywords.some((word) => foldVi(word.toLowerCase()).includes(q)) ||
    entry.shortcode.includes(q.replace(/:/g, ''))
  );
}

type EmojiTab = EmojiGroup | 'recent' | 'server';

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

const EMOJI_COLUMNS = 9;

type Hovered = { glyph?: string; image?: string; label: string } | null;

export function EmojiPicker({
  onPick,
  serverId,
  onPickCustom,
}: {
  onPick: (unicode: string) => void;
  serverId?: string;
  onPickCustom?: (token: string) => void;
}) {
  const t = useTranslations('emoji');
  const tc = useTranslations('common');
  const [query, setQuery] = useState('');
  const [tone, setTone] = useState(0); // 0 = mặc định; 1-5 = Fitzpatrick modifier
  const [toneOpen, setToneOpen] = useState(false);
  const [hovered, setHovered] = useState<Hovered>(null);
  const { tab, scrollRef, jumpTo, syncActive } = useSectionRail<EmojiTab>({
    initialTab: 'recent',
    clearQuery: () => setQuery(''),
  });
  const recent = useSyncExternalStore(
    subscribeRecentEmoji,
    recentEmojiSnapshot,
    serverRecentEmojiSnapshot,
  );
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
    rememberEmoji(unicode);
    onPick(unicode);
  }

  function pickCustom(emoji: CustomEmojiDto) {
    onPickCustom?.(emojiInsertToken(emoji));
  }

  function onGridKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const grid = event.currentTarget.closest('[data-grid]');
    const buttons = Array.from(grid?.querySelectorAll<HTMLButtonElement>('button') ?? []);
    const index = buttons.indexOf(event.currentTarget);
    if (index < 0) return;
    const next = gridArrowKeyIndex(event.key, index, buttons.length, EMOJI_COLUMNS);
    if (next === undefined) return;
    event.preventDefault();
    buttons[next]!.focus();
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
          onScroll={() => syncActive('recent')}
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
                    <EmojiButton
                      key={entry.unicode}
                      entry={entry}
                      onPick={pick}
                      onHover={setHovered}
                      onKeyDown={onGridKeyDown}
                    />
                  ))}
                  {customResults.map((emoji) => (
                    <CustomEmojiButton
                      key={emoji.id}
                      emoji={emoji}
                      onPick={pickCustom}
                      onHover={setHovered}
                      onKeyDown={onGridKeyDown}
                    />
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
                        <CustomEmojiButton
                          key={emoji.id}
                          emoji={emoji}
                          onPick={pickCustom}
                          onHover={setHovered}
                          onKeyDown={onGridKeyDown}
                        />
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
                      <EmojiButton
                        key={entry.unicode}
                        entry={entry}
                        onPick={pick}
                        onHover={setHovered}
                        onKeyDown={onGridKeyDown}
                      />
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
