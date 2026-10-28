'use client';

import { Suspense, use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Pin, Users } from 'lucide-react';
import { useTranslations } from 'use-intl';
import { Button } from '@/components/ui/button';
import { MessageListSkeleton } from '@/components/skeletons';
import { MemberPanel } from '@/features/members/components/member-panel';
import { useMemberPanel } from '@/features/members/store';
import { NotificationBell } from '@/features/notifications/components/notification-bell';
import { AskDialog } from '@/features/messages/components/ask-dialog';
import { SearchDialog } from '@/features/search/components/search-dialog';
import { MessagePane } from '@/features/messages/components/message-pane';
import { PinnedPanel } from '@/features/messages/components/pinned-panel';
import { messagePath } from '@/features/servers/navigation';
import { useChannels } from '../hooks';

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
 * Tin cần nhảy tới có hai nguồn: permalink `/…/messages/:messageId` (TG.5, ADR-0063 — page
 * truyền `focusId`) và `?m=<messageId>` cũ (chip trích dẫn AI, link đã chia sẻ trước TG.5).
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
  const togglePanel = useMemberPanel((state) => state.toggle);
  const [askOpen, setAskOpen] = useState(false);
  const [pinsOpen, setPinsOpen] = useState(false);

  if (!channel) {
    return <p className="m-auto text-sm text-muted-foreground">{t('channels.notFound')}</p>;
  }

  function goToMessage(messageId: string) {
    setAskOpen(false);
    router.push(messagePath(serverId, channelId, messageId));
  }

  return (
    <div className="flex min-h-0 flex-1">
      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center border-b px-4 font-semibold shadow-xs">
          <span className="mr-1.5 text-xl leading-none text-muted-foreground">#</span>
          {channel.name}
          <SearchDialog serverId={serverId} />
          <Button
            variant="ghost"
            size="icon"
            aria-pressed={pinsOpen}
            aria-label={t(pinsOpen ? 'messages.pinnedHide' : 'messages.pinnedShow')}
            data-testid="pins-toggle"
            onClick={() => setPinsOpen((open) => !open)}
          >
            <Pin />
          </Button>
          {/* TG.12: chuông cài đặt thông báo của kênh (mức + mute), kế thừa mặc định server. */}
          <NotificationBell serverId={serverId} channelId={channel.id} />
          <Button
            variant="ghost"
            size="icon"
            aria-pressed={panelOpen}
            aria-label={t(panelOpen ? 'members.hide' : 'members.show')}
            onClick={togglePanel}
          >
            <Users />
          </Button>
          <AskDialog
            serverId={serverId}
            channelId={channel.id}
            open={askOpen}
            onOpenChange={setAskOpen}
            onCitationClick={goToMessage}
          />
        </header>
        <Suspense fallback={<MessageListSkeleton />}>
          {/* key: mỗi channel một trạng thái riêng (nháp, vị trí cuộn lần đầu). Tin đích của
              permalink cũng là một "phiên xem" riêng: mở link khác thì nạp lại cửa sổ mới. */}
          <MessagePane
            key={`${channel.id}:${focusId ?? ''}`}
            serverId={serverId}
            channelId={channel.id}
            channelName={channel.name}
            focusId={focusId}
          />
        </Suspense>
      </section>
      {panelOpen && <MemberPanel serverId={serverId} />}
      {/* TG.3: panel ghim là sibling của pane tin nhắn (không nằm trong danh sách ảo hoá). */}
      {pinsOpen && <PinnedPanel channelId={channel.id} onOpen={goToMessage} />}
    </div>
  );
}
