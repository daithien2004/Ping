'use client';

import { Suspense, use, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, Pin, Users } from 'lucide-react';
import { useTranslations } from 'use-intl';
import { PingIconButton } from '@/components/ui/ping-icon-button';
import { MessageListSkeleton } from '@/features/messages/components/message-list-skeleton';
import { MemberPanel } from '@/features/members/components/member-panel';
import { useMemberPanel } from '@/features/members/store';
import { NotificationBell } from '@/features/notifications/components/notification-bell';
import { AskDialog } from '@/features/messages/components/ask-dialog';
import { SearchDialog } from '@/features/search/components/search-dialog';
import type { ChannelScope } from '@/features/messages/channel-scope';
import { MessagePane } from '@/features/messages/components/message-pane';
import { PinnedPanel } from '@/features/messages/components/pinned-panel';
import { useServerAbility } from '@/features/permissions/context';
import { messagePath } from '@/features/servers/navigation';
import { useChannels } from '../hooks';
import { ChannelTopicDialog } from './channel-topic-dialog';

/** `use()` cần một promise ổn định cho trang permalink (không có searchParams). */
const EMPTY_QUERY: Promise<Record<string, string | string[] | undefined>> = Promise.resolve({});

/** Lấy params từ prop của page, KHÔNG useParams(): <Activity> giữ trang ẩn nên useParams() trả params URL hiện tại. */
export function ChannelView({
  params,
  searchParams,
  focusId: focusIdProp,
}: {
  params: Promise<{ serverId: string; channelId: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
  focusId?: string | null;
}) {
  const { serverId, channelId } = use(params);
  const query = use(searchParams ?? EMPTY_QUERY);
  const focusId = focusIdProp ?? (typeof query.m === 'string' ? query.m : null);
  const { data: channels } = useChannels(serverId);
  const channel = channels.find((item) => item.id === channelId);
  const t = useTranslations();
  const router = useRouter();
  const panelOpen = useMemberPanel((state) => state.open);
  const setPanelOpen = useMemberPanel((state) => state.setOpen);
  const togglePanel = useMemberPanel((state) => state.toggle);
  const { ability } = useServerAbility();
  const canManage = ability.can('manage', 'Channel');
  const [askOpen, setAskOpen] = useState(false);
  const [pinsOpen, setPinsOpen] = useState(false);
  const [topicOpen, setTopicOpen] = useState(false);
  const pathToMessage = useCallback(
    (messageId: string) => messagePath(serverId, channelId, messageId),
    [serverId, channelId],
  );
  const scope = useMemo<ChannelScope>(
    () => ({ kind: 'server', serverId, messagePath: pathToMessage }),
    [serverId, pathToMessage],
  );

  useEffect(() => {
    const media = window.matchMedia('(max-width: 1023px)');
    const closeOnNarrow = () => {
      if (media.matches) setPanelOpen(false);
    };
    closeOnNarrow();
    media.addEventListener('change', closeOnNarrow);
    return () => media.removeEventListener('change', closeOnNarrow);
  }, [setPanelOpen]);

  if (!channel) {
    return <p className="m-auto text-sm text-muted-foreground">{t('channels.notFound')}</p>;
  }

  function goToMessage(messageId: string) {
    setAskOpen(false);
    router.push(pathToMessage(messageId));
  }

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1">
      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header
          data-slot="channel-header"
          className="flex h-header shrink-0 items-center gap-2 px-4"
        >
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span aria-hidden className="shrink-0 text-2xl leading-none text-muted-foreground">
              #
            </span>
            <h2 className="truncate text-base font-semibold">{channel.name}</h2>
            {channel.topic && (
              <div data-slot="topic-inline" className="contents">
                <span aria-hidden className="h-4 w-px shrink-0 bg-border" />
                <p
                  className="min-w-0 truncate text-sm font-normal text-muted-foreground"
                  data-testid="channel-topic"
                >
                  {channel.topic}
                </p>
              </div>
            )}
          </div>
          <div data-slot="channel-actions" className="flex min-w-0 items-center gap-1">
            {canManage && (
              <PingIconButton
                icon={<Pencil />}
                aria-label={t('channels.editTopic')}
                data-testid="channel-topic-edit"
                onClick={() => setTopicOpen(true)}
              />
            )}
            <PingIconButton
              icon={<Pin />}
              aria-pressed={pinsOpen}
              aria-label={t(pinsOpen ? 'messages.pinnedHide' : 'messages.pinnedShow')}
              data-testid="pins-toggle"
              onClick={() => setPinsOpen((open) => !open)}
            />
            <NotificationBell serverId={serverId} channelId={channel.id} />
            <PingIconButton
              icon={<Users />}
              aria-pressed={panelOpen}
              aria-label={t(panelOpen ? 'members.hide' : 'members.show')}
              onClick={togglePanel}
            />
            <AskDialog
              serverId={serverId}
              channelId={channel.id}
              open={askOpen}
              onOpenChange={setAskOpen}
              onCitationClick={goToMessage}
            />
            <SearchDialog serverId={serverId} />
          </div>
        </header>
        <Suspense fallback={<MessageListSkeleton />}>
          <MessagePane
            key={`${channel.id}:${focusId ?? ''}`}
            scope={scope}
            channelId={channel.id}
            channelName={channel.name}
            focusId={focusId}
          />
        </Suspense>
      </section>
      {panelOpen && <MemberPanel serverId={serverId} />}
      {pinsOpen && <PinnedPanel channelId={channel.id} onOpen={goToMessage} />}
      {topicOpen && (
        <ChannelTopicDialog
          serverId={serverId}
          channelId={channel.id}
          initialTopic={channel.topic ?? ''}
          open
          onClose={() => setTopicOpen(false)}
        />
      )}
    </div>
  );
}
