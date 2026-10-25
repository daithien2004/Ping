import { ChannelView } from '@/features/channels/components/channel-view';

/**
 * Permalink của một tin (TG.5, ADR-0063): mở channel ở cửa sổ quanh tin đích thay vì tin mới
 * nhất. `?m=` vẫn được hỗ trợ như alias cũ (link đã chia sẻ, chip trích dẫn AI).
 */
export default async function MessagePermalinkPage({
  params,
}: {
  params: Promise<{ serverId: string; channelId: string; messageId: string }>;
}) {
  const { messageId } = await params;
  return <ChannelView params={params} focusId={messageId} />;
}
