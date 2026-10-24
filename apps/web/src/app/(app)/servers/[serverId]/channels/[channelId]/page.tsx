import { ChannelView } from '@/features/channels/components/channel-view';

export default function ChannelPage({
  params,
  searchParams,
}: {
  params: Promise<{ serverId: string; channelId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  return <ChannelView params={params} searchParams={searchParams} />;
}
