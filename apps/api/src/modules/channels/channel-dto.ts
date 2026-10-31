import type { ChannelDto } from '@ping/shared';

/**
 * DTO của channel server (dùng chung cho ChannelsService và nơi phát `channel.updated`).
 * `serverId` truyền riêng vì kiểu Prisma của Channel hiện nullable (TG.9: DM có serverId
 * NULL) — các đường tới đây chỉ là channel server đã narrow.
 * TG.10: DTO thêm `categoryId`, `positionKey`, `topic`; `position` Int giữ nguyên hợp đồng
 * (thứ tự vùng mặc định — xem chú thích ChannelDto bên shared).
 */
export function toChannelDto(
  channel: {
    id: string;
    name: string;
    type: string;
    position: number;
    categoryId: string | null;
    positionKey: string | null;
    topic: string | null;
    createdAt: Date;
  },
  serverId: string,
): ChannelDto {
  return {
    id: channel.id,
    serverId,
    name: channel.name,
    type: channel.type as ChannelDto['type'],
    position: channel.position,
    categoryId: channel.categoryId,
    positionKey: channel.positionKey,
    topic: channel.topic,
    createdAt: channel.createdAt.toISOString(),
  };
}
