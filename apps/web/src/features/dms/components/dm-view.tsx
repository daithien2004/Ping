'use client';

import { ErrorCodes, type DmSummary } from '@ping/shared';
import { Ban, Pin, ShieldX } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { use, useState, type ReactNode } from 'react';
import { useTranslations } from 'use-intl';
import { Loading } from '@/components/loading';
import { Button } from '@/components/ui/button';
import { PingPopconfirm } from '@/components/ui/ping-popconfirm';
import { pingToast } from '@/components/ui/ping-toast';
import { PinnedPanel } from '@/features/messages/components/pinned-panel';
import { MessagePane } from '@/features/messages/components/message-pane';
import { NotificationBell } from '@/features/notifications/components/notification-bell';
import { UserAvatar } from '@/features/profile/components/user-avatar';
import { ApiError } from '@/lib/api-client';
import { useErrorMessage } from '@/lib/error-message';
import { DmAbilityProvider } from './dm-ability-provider';
import { useDms, useToggleBlock } from '../hooks';
import { dmMessagePath } from '../navigation';
import { selectDmBlocked, useDmBlockStore } from '../store';

/** `use()` cần một promise ổn định cho trang permalink (không có searchParams). */
const EMPTY_QUERY: Promise<Record<string, string | string[] | undefined>> = Promise.resolve({});

/**
 * Vùng nội dung của một DM (TG.9, ADR-0070): header đối tác + pane tin nhắn tái dùng.
 *
 * Route `/dms/:channelId` thay vì route channel của server vì DM không có `serverId` trong
 * URL và không qua `ServerAbilityProvider` (fetch quyền theo server) — quyền chat của
 * participant do `DmAbilityProvider` cấp. Các bề mặt chỉ có ở server (AI search/ask, panel
 * thành viên) không render ở đây; ghim vẫn dùng được (ADR-0070 mục 8).
 */
export function DmView({
  params,
  searchParams,
  focusId: focusIdProp,
}: {
  params: Promise<{ channelId: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
  /** Permalink `/dms/:channelId/messages/:messageId`: tin đích lấy từ segment của route. */
  focusId?: string | null;
}) {
  const { channelId } = use(params);
  const query = use(searchParams ?? EMPTY_QUERY);
  const focusId = focusIdProp ?? (typeof query.m === 'string' ? query.m : null);
  const { data: dms, isPending, isSuccess } = useDms();
  // Dữ liệu DM lấy từ GET /dms (một nguồn duy nhất — header, rail và badge cùng cache).
  const dm = dms?.find((row) => row.channelId === channelId);
  const t = useTranslations('dms');

  let content: ReactNode;
  if (isPending) {
    content = <Loading />;
  } else if (isSuccess && !dm) {
    // IDOR an toàn: DM của người khác chỉ "không tìm thấy" (API trả 404, không lộ tồn tại).
    content = <p className="m-auto text-sm text-muted-foreground">{t('notFound')}</p>;
  } else if (dm) {
    content = <DmConversation dm={dm} focusId={focusId} />;
  } else {
    content = <Loading />;
  }

  return (
    <div className="flex min-h-0 flex-1">
      <section className="flex min-h-0 min-w-0 flex-1 flex-col">{content}</section>
    </div>
  );
}

/**
 * Hội thoại đã có dữ liệu đối tác. Ghim, chặn/bỏ chặn và banner nằm ở đây; pane tin nhắn
 * nhận `serverId: null` để chạy đúng chế độ DM (cursor đọc từ DmSummary, permalink `/dms/…`).
 */
function DmConversation({ dm, focusId }: { dm: DmSummary; focusId: string | null }) {
  const t = useTranslations('dms');
  const tm = useTranslations('messages');
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const [pinsOpen, setPinsOpen] = useState(false);
  const setBlocked = useDmBlockStore((state) => state.setBlocked);
  const blocked = useDmBlockStore(selectDmBlocked(dm.partner.id));
  const toggleBlock = useToggleBlock();

  function toggle(block: boolean) {
    toggleBlock.mutate(
      { userId: dm.partner.id, block },
      { onError: (error) => pingToast.error(errorMessage(error)) },
    );
  }

  // 403 DM_BLOCKED khi gửi tin: API dùng chung một mã cho cả hai chiều (chống dò nguyên nhân)
  // nên client cũng hiển thị trung lập — banner + tắt composer cho tới khi có thay đổi.
  function onSendError(error: unknown) {
    if (error instanceof ApiError && error.code === ErrorCodes.DM_BLOCKED) {
      setBlocked(dm.partner.id, true);
    }
  }

  function goToMessage(messageId: string) {
    router.push(dmMessagePath(dm.channelId, messageId));
  }

  return (
    <DmAbilityProvider partnerId={dm.partner.id}>
      <header
        data-testid="dm-header"
        className="flex h-12 shrink-0 items-center gap-2 border-b px-4 shadow-xs"
      >
        <UserAvatar name={dm.partner.displayName} avatarUrl={dm.partner.avatarUrl} size="sm" />
        <p className="truncate font-semibold">{dm.partner.displayName}</p>
        <span className="truncate text-xs text-muted-foreground">@{dm.partner.username}</span>
        <div className="ml-auto flex items-center gap-1">
          {/* TG.12: DM không có dòng server — chuông đặt mức/mute riêng cho hội thoại này. */}
          <NotificationBell serverId={null} channelId={dm.channelId} dm />
          <Button
            variant="ghost"
            size="icon"
            aria-pressed={pinsOpen}
            aria-label={tm(pinsOpen ? 'pinnedHide' : 'pinnedShow')}
            data-testid="pins-toggle"
            onClick={() => setPinsOpen((open) => !open)}
          >
            <Pin />
          </Button>
          {blocked ? (
            // Bỏ chặn: xác nhận nhẹ — không phải hành động nguy hiểm như chặn.
            <PingPopconfirm
              title={t('unblockConfirm', { name: dm.partner.displayName })}
              onConfirm={() => toggle(false)}
              okText={t('unblock')}
              cancelText={t('cancel')}
            >
              <Button variant="outline" size="sm" data-testid="dm-unblock">
                <Ban /> {t('unblock')}
              </Button>
            </PingPopconfirm>
          ) : (
            // Chặn: hành động ảnh hưởng hai chiều — luôn hỏi lại (quy ước PingPopconfirm).
            <PingPopconfirm
              title={t('blockConfirm', { name: dm.partner.displayName })}
              description={t('blockHint')}
              onConfirm={() => toggle(true)}
              okText={t('block')}
              cancelText={t('cancel')}
            >
              <Button variant="outline" size="sm" data-testid="dm-block">
                <ShieldX /> {t('block')}
              </Button>
            </PingPopconfirm>
          )}
        </div>
      </header>
      {blocked && (
        <p
          role="status"
          data-testid="dm-blocked-banner"
          className="border-b bg-muted px-4 py-2 text-sm text-muted-foreground"
        >
          {t('blockedBanner')}
        </p>
      )}
      {/* key: mỗi tin đích permalink là một phiên xem riêng, như ChannelView. */}
      <MessagePane
        key={`${dm.channelId}:${focusId ?? ''}`}
        serverId={null}
        channelId={dm.channelId}
        channelName={dm.partner.displayName}
        focusId={focusId}
        dm={{ lastReadMessageId: dm.lastReadMessageId, onSendError }}
      />
      {/* Panel ghim là sibling của pane (không nằm trong danh sách ảo hóa), như ChannelView. */}
      {pinsOpen && <PinnedPanel channelId={dm.channelId} onOpen={goToMessage} />}
    </DmAbilityProvider>
  );
}
