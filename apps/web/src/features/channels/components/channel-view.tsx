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

/**
 * Vùng nội dung của một channel: tiêu đề + danh sách tin + ô soạn tin.
 *
 * Lấy params từ prop của page, KHÔNG dùng useParams(): <Activity> giữ trang channel cũ ở dạng ẩn,
 * và useParams() trong trang ẩn trả params của URL HIỆN TẠI → trang #general ẩn render lại thành
 * #dev, key của MessagePane đổi, nháp + vị trí cuộn mất (đã gặp khi kiểm tra). `params` của page
 * luôn là params của chính trang đó. `searchParams` cũng lấy từ page vì lý do tương tự.
 *
 * Tin cần nhảy tới có hai nguồn: permalink `/channels/:serverId/:channelId/:messageId` (TG.5,
 * ADR-0063, URL ADR-0088 — page truyền `focusId`) và `?m=<messageId>` cũ (chip trích dẫn AI,
 * link đã chia sẻ trước TG.5).
 */
export function ChannelView({
  params,
  searchParams,
  focusId: focusIdProp,
}: {
  params: Promise<{ serverId: string; channelId: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
  /** Permalink: tin đích lấy từ segment của route thay vì query. */
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

  // Dưới `lg` panel thành viên là overlay (T6.8) nên không được mặc định mở đè lên tin nhắn:
  // đóng khi vào màn hẹp hoặc khi cửa sổ thu nhỏ qua mốc lg.
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
        {/* Discord: header 49 px, nền trùng nền chat (không viền), tên kênh + chủ đề trên CÙNG
            một dòng. Hàng icon theo thứ tự Discord (ghim, chuông, thành viên), ô tìm kiếm 244 px
            nằm cuối; nút "Hỏi Ping" chỉ là icon để không phá nhịp header. */}
        <header
          data-slot="channel-header"
          className="flex h-header shrink-0 items-center gap-2 px-4"
        >
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <span aria-hidden className="shrink-0 text-2xl leading-none text-muted-foreground">
              #
            </span>
            <h2 className="truncate text-base font-semibold">{channel.name}</h2>
            {/* TG.10: chủ đề hiển thị ngay sau tên kênh (header), quản lý kênh sửa qua nút bút. */}
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
          {/* `min-w-0`: cửa sổ hẹp thì ô tìm kiếm co lại (đến 96 px) thay vì đẩy header tràn
              ra ngoài — trước đây 244 px cố định cộng 5 icon là nguồn tràn ngang của cả trang. */}
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
            {/* TG.12: chuông cài đặt thông báo của kênh (mức + mute), kế thừa mặc định server. */}
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
        {/* Dải chủ đề chạy chữ của skin Pop: ẩn mặc định, aria-hidden vì chủ đề đã đọc ở header. */}
        {channel.topic && (
          <p aria-hidden data-slot="topic-strip" className="hidden">
            <span>{channel.topic}</span>
          </p>
        )}
        <Suspense fallback={<MessageListSkeleton />}>
          {/* key: mỗi channel một trạng thái riêng (nháp, vị trí cuộn lần đầu). Tin đích của
              permalink cũng là một "phiên xem" riêng: mở link khác thì nạp lại cửa sổ mới. */}
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
      {/* TG.3: panel ghim là sibling của pane tin nhắn (không nằm trong danh sách ảo hoá). */}
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
