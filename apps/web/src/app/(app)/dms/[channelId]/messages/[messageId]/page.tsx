import { DmView } from '@/features/dms/components/dm-view';

/**
 * Permalink của một tin trong DM (TG.5, ADR-0063): mở hội thoại ở cửa sổ quanh tin đích.
 * Route `/dms/:channelId/messages/:messageId` — mirror của permalink channel server.
 */
export default async function DmMessagePermalinkPage({
  params,
}: {
  params: Promise<{ channelId: string; messageId: string }>;
}) {
  const { messageId } = await params;
  return <DmView params={params} focusId={messageId} />;
}
