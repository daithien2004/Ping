import { DmView } from '@/features/dms/components/dm-view';

/** Trang hội thoại DM (TG.9, ADR-0070): route riêng vì DM không có serverId trong URL. */
export default function DmChannelPage({
  params,
  searchParams,
}: {
  params: Promise<{ channelId: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  return <DmView params={params} searchParams={searchParams} />;
}
