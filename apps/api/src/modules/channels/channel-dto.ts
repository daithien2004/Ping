import type { ChannelDto } from '@ping/shared';

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
