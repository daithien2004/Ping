import { ChannelView } from '@/features/channels/components/channel-view';

export default function ChannelPage({
  params,
}: {
  params: Promise<{ serverId: string; channelId: string }>;
}) {
  return <ChannelView params={params} />;
}
