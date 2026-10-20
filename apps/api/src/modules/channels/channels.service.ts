import { Injectable, NotFoundException } from '@nestjs/common';
import { Limits } from '@ping/shared';
import { limitReached } from '../../common/limit-reached.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.module.js';
import type { UpdateChannelInput } from './schemas.js';

@Injectable()
export class ChannelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  create(serverId: string, name: string) {
    return this.prisma.$transaction(async (tx) => {
      // Khóa theo server tới hết transaction: hai request tạo channel cùng lúc xếp hàng
      // thay vì cùng đọc một giá trị max rồi cùng ghi trùng position.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${serverId}))`;
      // Đếm TRONG lock nên trần chính xác, không bị vượt khi tạo đồng thời.
      if ((await tx.channel.count({ where: { serverId } })) >= Limits.MAX_CHANNELS_PER_SERVER) {
        throw limitReached('channels', Limits.MAX_CHANNELS_PER_SERVER);
      }
      const { _max } = await tx.channel.aggregate({
        where: { serverId },
        _max: { position: true },
      });
      // Nối tiếp sau channel cuối (max + 1, không phải count: xóa channel giữa dãy làm count trùng).
      return tx.channel.create({
        data: { serverId, name, position: (_max.position ?? -1) + 1 },
      });
    });
  }

  list(serverId: string) {
    return this.prisma.channel.findMany({
      where: { serverId },
      orderBy: { position: 'asc' },
    });
  }

  async update(channelId: string, input: UpdateChannelInput) {
    const channel = await this.getChannel(channelId);
    return this.prisma.channel.update({ where: { id: channel.id }, data: input });
  }

  async remove(channelId: string, actorId: string): Promise<{ id: string }> {
    const channel = await this.getChannel(channelId);
    // Cascade khai báo trong schema: xóa channel kéo toàn bộ tin nhắn theo.
    await this.prisma.$transaction([
      this.prisma.channel.delete({ where: { id: channel.id } }),
      this.audit.record({
        serverId: channel.serverId,
        actorId,
        action: 'CHANNEL_DELETE',
        targetId: channel.id,
        metadata: { name: channel.name },
      }),
    ]);
    return { id: channelId };
  }

  private async getChannel(channelId: string) {
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) {
      throw new NotFoundException('Channel not found');
    }
    return channel;
  }
}
