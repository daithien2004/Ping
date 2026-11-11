'use client';

import { ErrorCodes, type DmSummary } from '@ping/shared';
import { useRouter } from 'next/navigation';
import { use, useCallback, useMemo, useState } from 'react';
import { useTranslations } from 'use-intl';
import { Loading } from '@/components/loading';
import { PingButton } from '@/components/ui/ping-button';
import { pingToast } from '@/components/ui/ping-toast';
import type { ChannelScope } from '@/features/messages/channel-scope';
import { PinnedPanel } from '@/features/messages/components/pinned-panel';
import { MessagePane } from '@/features/messages/components/message-pane';
import { ApiError } from '@/lib/api-client';
import { useErrorMessage } from '@/lib/error-message';
import { DmAbilityProvider } from './dm-ability-provider';
import { DmBlockedBanner, DmHeader } from './dm-header';
import { dmViewState } from '../dm-view-state';
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
  // Dữ liệu DM lấy từ GET /dms (một nguồn duy nhất — header, rail và badge cùng cache).
  const { data: dms, isPending, isError, error, refetch, isFetching } = useDms();
  const errorMessage = useErrorMessage();
  const state = dmViewState({ isPending, isError, dms, channelId });

  return (
    <div className="flex min-h-0 flex-1">
      <section className="flex min-h-0 min-w-0 flex-1 flex-col">
        {state.kind === 'loading' && <Loading />}
        {state.kind === 'error' && (
          <DmLoadError message={errorMessage(error)} onRetry={refetch} busy={isFetching} />
        )}
        {state.kind === 'notFound' && <DmNotFound />}
        {state.kind === 'ready' && <DmConversation dm={state.dm} focusId={focusId} />}
      </section>
    </div>
  );
}

function DmLoadError({
  message,
  onRetry,
  busy,
}: {
  message: string;
  onRetry: () => unknown;
  busy: boolean;
}) {
  const tc = useTranslations('common');
  return (
    <div role="alert" className="m-auto flex flex-col items-center gap-3 px-4 text-center text-sm">
      <p className="text-destructive">{message}</p>
      <PingButton
        variant="secondary"
        size="sm"
        disabled={busy}
        onClick={() => void onRetry()}
        data-testid="dm-retry"
      >
        {tc('retry')}
      </PingButton>
    </div>
  );
}

/** IDOR an toàn: DM của người khác chỉ "không tìm thấy" (API trả 404, không lộ tồn tại). */
function DmNotFound() {
  const t = useTranslations('dms');
  return <p className="m-auto text-sm text-muted-foreground">{t('notFound')}</p>;
}

/**
 * Hội thoại đã có dữ liệu đối tác. Ghim, chặn/bỏ chặn và banner nằm ở đây; pane tin nhắn
 * nhận scope `dm` để chạy đúng chế độ DM (cursor đọc từ DmSummary, permalink `/dms/…`).
 */
function DmConversation({ dm, focusId }: { dm: DmSummary; focusId: string | null }) {
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
  const partnerId = dm.partner.id;
  const onSendError = useCallback(
    (error: unknown) => {
      if (error instanceof ApiError && error.code === ErrorCodes.DM_BLOCKED) {
        setBlocked(partnerId, true);
      }
    },
    [setBlocked, partnerId],
  );
  const pathToMessage = useCallback(
    (messageId: string) => dmMessagePath(dm.channelId, messageId),
    [dm.channelId],
  );
  const scope = useMemo<ChannelScope>(
    () => ({
      kind: 'dm',
      lastReadMessageId: dm.lastReadMessageId,
      messagePath: pathToMessage,
      onSendError,
    }),
    [dm.lastReadMessageId, pathToMessage, onSendError],
  );

  return (
    <DmAbilityProvider partnerId={dm.partner.id}>
      <DmHeader
        dm={dm}
        pinsOpen={pinsOpen}
        onTogglePins={() => setPinsOpen((open) => !open)}
        blocked={blocked}
        onToggleBlock={toggle}
      />
      {blocked && <DmBlockedBanner />}
      {/* key: mỗi tin đích permalink là một phiên xem riêng, như ChannelView. */}
      <MessagePane
        key={`${dm.channelId}:${focusId ?? ''}`}
        scope={scope}
        channelId={dm.channelId}
        channelName={dm.partner.displayName}
        focusId={focusId}
      />
      {/* Panel ghim là sibling của pane (không nằm trong danh sách ảo hóa), như ChannelView. */}
      {pinsOpen && (
        <PinnedPanel
          channelId={dm.channelId}
          onOpen={(messageId) => router.push(pathToMessage(messageId))}
        />
      )}
    </DmAbilityProvider>
  );
}
