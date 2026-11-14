import { ME_SEGMENT, channelUrl, messageUrl, ownerUrl } from '@/lib/channel-url';

/**
 * URL công khai kiểu Discord (ADR-0088): `/channels/@me/:channelId` — `@me` thay serverId vì DM
 * không thuộc server nào (ADR-0070). Route nội bộ vẫn là `/dms/:channelId` (next.config rewrite),
 * nên layout DM và chế độ `dm` của `MessagePane` không phải đổi.
 */
export const dmsPath = () => ownerUrl(ME_SEGMENT);

export const dmPath = (channelId: string) => channelUrl(ME_SEGMENT, channelId);

export const dmMessagePath = (channelId: string, messageId: string) =>
  messageUrl(ME_SEGMENT, channelId, messageId);
