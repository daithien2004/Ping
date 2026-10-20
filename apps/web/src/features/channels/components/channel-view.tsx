'use client';

import { useParams } from 'next/navigation';
import { useChannels } from '../hooks';

/** Vùng nội dung của một channel. F4 thêm danh sách tin nhắn và ô soạn tin. */
export function ChannelView() {
  const { serverId, channelId } = useParams<{ serverId: string; channelId: string }>();
  const { data: channels } = useChannels(serverId);
  const channel = channels.find((item) => item.id === channelId);

  if (!channel) {
    return <p className="m-auto text-sm text-gray-500">Channel không tồn tại.</p>;
  }

  return (
    <section className="flex flex-1 flex-col">
      <header className="border-b border-gray-200 px-4 py-3 font-semibold dark:border-gray-700">
        # {channel.name}
      </header>
      <p className="m-auto text-sm text-gray-500">Tin nhắn sẽ hiển thị ở đây (F4).</p>
    </section>
  );
}
