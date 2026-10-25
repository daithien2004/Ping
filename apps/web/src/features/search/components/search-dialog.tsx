'use client';

import type { SearchResultItem } from '@ping/shared';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useLocale, useTranslations } from 'use-intl';
import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PingButton } from '@/components/ui/ping-button';
import { PingEmpty } from '@/components/ui/ping-empty';
import { PingInput } from '@/components/ui/ping-input';
import { PingModal } from '@/components/ui/ping-modal';
import { PingSelect } from '@/components/ui/ping-select';
import { useChannels } from '@/features/channels/hooks';
import { useMembers } from '@/features/members/hooks';
import { useErrorMessage } from '@/lib/error-message';
import { messagePath } from '@/features/servers/navigation';
import { useSearch } from '../hooks';

/**
 * Tìm kiếm tin nhắn trong server (T4.6, ADR-0045): FTS + trigram phía API; UI lọc
 * channel/người gửi/thời gian; bấm kết quả điều hướng permalink `/…/messages/:id` — khung chat
 * nạp cửa sổ quanh tin đó và highlight (TG.5, ADR-0062).
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
      {open && <SearchModal serverId={serverId} onClose={() => setOpen(false)} />}
    </>
  );
}

function SearchModal({ serverId, onClose }: { serverId: string; onClose: () => void }) {
  const t = useTranslations('search');
  const tc = useTranslations('common');
  const inputRef = useRef<HTMLInputElement>(null);
  // Dialog đã mở mới mount ô nhập: đưa con trỏ vào bằng focus() thay vì autoFocus (ADR-0029).
  useEffect(() => {
    inputRef.current?.focus();
  }, []);
  const router = useRouter();
  const [input, setInput] = useState('');
  const [q, setQ] = useState('');
  const [channelId, setChannelId] = useState('');
  const [authorId, setAuthorId] = useState('');
  // Lựa chọn thời gian: days để hiển thị select, since là ISO tính NGAY trong handler
  // (event handler được phép gọi Date.now; render thì không — react-hooks/purity).
  const [timeFilter, setTimeFilter] = useState<{ days: string; since?: string }>({ days: '' });
  const onTimeChange = (days: string) =>
    setTimeFilter({
      days,
      since:
        days === ''
          ? undefined
          : new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000).toISOString(),
    });
  const { data: channels } = useChannels(serverId);
  const { data: members } = useMembers(serverId);
  const errorMessage = useErrorMessage();
  const locale = useLocale();

  // Debounce: chỉ tìm sau khi ngừng gõ 350 ms, tránh dập API mỗi phím.
  useEffect(() => {
    const timer = setTimeout(() => setQ(input.trim()), 350);
    return () => clearTimeout(timer);
  }, [input]);

  const query = useSearch(
    serverId,
    {
      q,
      channelId: channelId || undefined,
      authorId: authorId || undefined,
      since: timeFilter.since,
    },
    q.length > 0,
  );
  const results = query.data?.pages.flatMap((page) => page.results) ?? [];

  function goTo(item: SearchResultItem) {
    onClose();
    router.push(messagePath(serverId, item.channelId, item.id));
  }

  return (
    <PingModal open onCancel={onClose} footer={null} title={t('title')} destroyOnHidden>
      <PingInput
        ref={inputRef}
        placeholder={t('placeholder')}
        value={input}
        aria-label={t('placeholder')}
        onChange={(event) => setInput(event.target.value)}
        data-testid="search-input"
      />
      <div className="mt-2 flex flex-wrap gap-2">
        <PingSelect
          aria-label={t('filterChannel')}
          className="w-40"
          value={channelId}
          onChange={setChannelId}
          options={[
            { value: '', label: t('filterAllChannels') },
            ...channels.map((channel) => ({ value: channel.id, label: `# ${channel.name}` })),
          ]}
        />
        <PingSelect
          aria-label={t('filterAuthor')}
          className="w-40"
          value={authorId}
          onChange={setAuthorId}
          options={[
            { value: '', label: t('filterAllAuthors') },
            ...(members?.pages[0]?.members ?? []).map((member) => ({
              value: member.userId,
              label: member.nickname ?? member.user.displayName,
            })),
          ]}
        />
        <PingSelect
          aria-label={t('filterTime')}
          className="w-36"
          value={timeFilter.days}
          onChange={onTimeChange}
          options={[
            { value: '', label: t('filterAnyTime') },
            { value: '7', label: t('filterDays', { days: 7 }) },
            { value: '30', label: t('filterDays', { days: 30 }) },
          ]}
        />
      </div>

      {query.isError ? (
        <p role="alert" className="mt-3 text-sm text-destructive">
          {errorMessage(query.error)}
        </p>
      ) : q.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">{t('typeToSearch')}</p>
      ) : query.isPending ? (
        <p className="mt-3 text-sm text-muted-foreground">{tc('loading')}</p>
      ) : results.length === 0 ? (
        <PingEmpty description={t('noResults')} />
      ) : (
        <>
          <ul
            aria-label={t('resultsLabel')}
            className="mt-3 max-h-80 list-none overflow-auto p-0"
            data-testid="search-results"
          >
            {results.map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => goTo(item)}
                  className="w-full rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent"
                >
                  <p className="text-xs text-muted-foreground">
                    # {item.channelName} · {item.author.displayName} ·{' '}
                    {new Date(item.createdAt).toLocaleString(locale)}
                  </p>
                  <p className="line-clamp-2 text-sm">{item.content}</p>
                </button>
              </li>
            ))}
          </ul>
          {query.hasNextPage && (
            <PingButton
              variant="secondary"
              size="sm"
              className="mt-2"
              loading={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              {t('loadMore')}
            </PingButton>
          )}
        </>
      )}
    </PingModal>
  );
}
