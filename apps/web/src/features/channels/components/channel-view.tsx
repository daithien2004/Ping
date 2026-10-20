'use client';

import { Suspense, use } from 'react';
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

  if (!channel) {
    return <p className="m-auto text-sm text-gray-500">Channel không tồn tại.</p>;
  }

  return (
    <section className="flex min-h-0 flex-1 flex-col">
      <header className="border-b border-gray-200 px-4 py-3 font-semibold dark:border-gray-700">
        # {channel.name}
      </header>
      <Suspense fallback={<p className="m-auto text-sm text-gray-500">Đang tải tin nhắn…</p>}>
        {/* key: mỗi channel một trạng thái riêng (nháp, vị trí cuộn lần đầu). */}
        <MessagePane key={channel.id} channelId={channel.id} channelName={channel.name} />
      </Suspense>
    </section>
  );
}
