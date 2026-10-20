'use client';

import { Suspense, use } from 'react';
import { useTranslations } from 'use-intl';
import { MessagePane } from '@/features/messages/components/message-pane';
import { useChannels } from '../hooks';

/**
 * Vùng nội dung của một channel: tiêu đề + danh sách tin + ô soạn tin.
 *
 * Lấy params từ prop của page, KHÔNG dùng useParams(): <Activity> giữ trang channel cũ ở dạng ẩn,
 * và useParams() trong trang ẩn trả params của URL HIỆN TẠI → trang #general ẩn render lại thành
 * #dev, key của MessagePane đổi, nháp + vị trí cuộn mất (đã gặp khi kiểm tra). `params` của page
 * luôn là params của chính trang đó.
 */
export function ChannelView({
  params,
}: {
  params: Promise<{ serverId: string; channelId: string }>;
}) {
  const { serverId, channelId } = use(params);
  const { data: channels } = useChannels(serverId);
  const channel = channels.find((item) => item.id === channelId);
  const t = useTranslations();

  if (!channel) {
    return <p className="m-auto text-sm text-muted-foreground">{t('channels.notFound')}</p>;
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center border-b px-4 font-semibold shadow-xs">
        <span className="mr-1.5 text-xl leading-none text-muted-foreground">#</span>
        {channel.name}
      </header>
      <Suspense
        fallback={<p className="m-auto text-sm text-muted-foreground">{t('messages.loading')}</p>}
      >
        {/* key: mỗi channel một trạng thái riêng (nháp, vị trí cuộn lần đầu). */}
        <MessagePane
          key={channel.id}
          serverId={serverId}
          channelId={channel.id}
          channelName={channel.name}
        />
      </Suspense>
    </section>
  );
}
