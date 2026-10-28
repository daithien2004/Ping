import { Injectable, NotFoundException } from '@nestjs/common';
import { Limits, ServerEvents, type ChannelDto, type UpdateChannelInput } from '@ping/shared';
import { limitReached } from '../../common/limit-reached.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';

@Injectable()
export class ChannelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
  ) {}

  async create(serverId: string, name: string) {
    const channel = await this.prisma.$transaction(async (tx) => {
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
      // Nối tiếp sau channel cuối (max + 1, không phải count: xóa channel giữa dãy làm count trống).
      return tx.channel.create({
        data: { serverId, name, position: (_max.position ?? -1) + 1 },
      });
    });
    // TG.9: Channel.serverId giờ nullable (DM); channel vừa tạo luôn có serverId từ route —
    // chốt lại để TypeScript thấy (fail-closed nếu lệch dữ liệu).
    if (channel.serverId === null) throw new NotFoundException('Channel not found');
    this.realtime.emitToServer(
      serverId,
      ServerEvents.ChannelCreated,
      this.toDto(channel, serverId),
    );
    return channel;
  }

  list(serverId: string) {
    return this.prisma.channel.findMany({
      where: { serverId },
      orderBy: { position: 'asc' },
    });
  }

  async update(channelId: string, actorId: string, input: UpdateChannelInput) {
    const current = await this.getChannel(channelId);
    // Guard chỉ cho phép tới đây với channel server (DM không có `manage Channel` —
    // defineDmAbilityFor); serverId NULL là lệch dữ liệu → fail-closed.
    if (current.serverId === null) throw new NotFoundException('Channel not found');
    const [channel] = await this.prisma.$transaction([
      this.prisma.channel.update({ where: { id: current.id }, data: input }),
      this.audit.record({
        serverId: current.serverId,
        actorId,
        action: 'CHANNEL_UPDATE',
        targetId: current.id,
        metadata: {
          ...(input.name !== undefined ? { from: current.name, to: input.name } : {}),
          ...(input.position !== undefined
            ? { position: { from: current.position, to: input.position } }
            : {}),
        },
      }),
    ]);
    if (channel.serverId === null) throw new NotFoundException('Channel not found');
    this.realtime.emitToServer(
      channel.serverId,
      ServerEvents.ChannelUpdated,
      this.toDto(channel, channel.serverId),
    );
    return channel;
  }

  async remove(channelId: string, actorId: string): Promise<{ id: string }> {
    const channel = await this.getChannel(channelId);
    // Guard chỉ cho phép tới đây với channel server (DM không có `manage Channel`).
    if (channel.serverId === null) throw new NotFoundException('Channel not found');
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
    this.realtime.emitToServer(channel.serverId, ServerEvents.ChannelDeleted, {
      id: channel.id,
      serverId: channel.serverId,
    });
    return { id: channelId };
  }

  /**
   * DTO của channel server. `serverId` truyền riêng vì kiểu Prisma của Channel hiện nullable
   * (TG.9: DM có serverId NULL) — các đường tới đây chỉ là channel server đã narrow.
   */
  private toDto(
    channel: {
      id: string;
      name: string;
      type: string;
      position: number;
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
      createdAt: channel.createdAt.toISOString(),
    };
  }

  private async getChannel(channelId: string) {
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) {
      throw new NotFoundException('Channel not found');
    }
    return channel;
  }
}
