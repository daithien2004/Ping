import { Injectable, NotFoundException } from '@nestjs/common';
import {
  Limits,
  ServerEvents,
  rankBetween,
  type ChannelDto,
  type ChannelReorderedPayload,
  type MoveChannelInput,
  type UpdateChannelInput,
} from '@ping/shared';
import { limitReached } from '../../common/limit-reached.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { assignRanks, compareRanks, rankAfter } from '../categories/ranks.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { toChannelDto } from './channel-dto.js';

@Injectable()
export class ChannelsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
  ) {}

  async create(serverId: string, name: string) {
    const channel = await this.prisma.$transaction(async (tx) => {
      // Khóa theo server tới hết transaction: request đồng thời xếp hàng, không ghi trùng position.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${serverId}))`;
      // Đếm trong lock để trần chính xác.
      if ((await tx.channel.count({ where: { serverId } })) >= Limits.MAX_CHANNELS_PER_SERVER) {
        throw limitReached('channels', Limits.MAX_CHANNELS_PER_SERVER);
      }
      const { _max } = await tx.channel.aggregate({
        where: { serverId },
        _max: { position: true },
      });
      // max + 1, không phải count: xóa channel giữa dãy làm count trống.
      return tx.channel.create({
        data: { serverId, name, position: (_max.position ?? -1) + 1 },
      });
    });
    if (channel.serverId === null) throw new NotFoundException('Channel not found');
    this.realtime.emitToServer(
      serverId,
      ServerEvents.ChannelCreated,
      toChannelDto(channel, serverId),
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
    // DM không có `manage Channel`; serverId NULL là lệch dữ liệu → fail-closed.
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
      toChannelDto(channel, channel.serverId),
    );
    return channel;
  }

  async remove(channelId: string, actorId: string): Promise<{ id: string }> {
    const channel = await this.getChannel(channelId);
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

  async move(channelId: string, actorId: string, input: MoveChannelInput): Promise<ChannelDto> {
    const channel = await this.getChannel(channelId);
    if (channel.serverId === null) throw new NotFoundException('Channel not found');
    const serverId = channel.serverId;

    if (input.categoryId !== null) {
      // Category đích phải cùng server: id server khác → 404.
      const category = await this.prisma.channelCategory.findFirst({
        where: { id: input.categoryId, serverId },
        select: { id: true },
      });
      if (!category) throw new NotFoundException('Category not found');
    }

    await this.prisma.$transaction(async (tx) => {
      if (input.categoryId === null) {
        // Khóa chung với create channel để hai request đồng thời không lấy trùng max.
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${serverId}))`;
        const { _max } = await tx.channel.aggregate({
          where: { serverId },
          _max: { position: true },
        });
        await tx.channel.update({
          where: { id: channel.id },
          data: { categoryId: null, positionKey: null, position: (_max.position ?? -1) + 1 },
        });
        return;
      }

      // Khóa 'cat:' dùng chung với category create.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'cat:' + serverId}))`;
      let positionKey = input.positionKey;
      if (positionKey === undefined) {
        const members = await tx.channel.findMany({
          where: {
            categoryId: input.categoryId,
            positionKey: { not: null },
            id: { not: channel.id },
          },
          select: { id: true, positionKey: true },
        });
        const last = members.reduce<(typeof members)[number] | null>(
          (acc, member) =>
            acc === null || compareRanks(member.positionKey!, acc.positionKey!) > 0 ? member : acc,
          null,
        );
        const rank = last ? rankAfter(last.positionKey!) : rankBetween(undefined, undefined);
        if (rank !== null) {
          positionKey = rank;
        } else {
          const others = await tx.channel.findMany({
            where: { categoryId: input.categoryId, id: { not: channel.id } },
            select: { id: true, positionKey: true },
          });
          const ordered = [...others].sort((a, b) =>
            compareRanks(a.positionKey ?? '', b.positionKey ?? ''),
          );
          const ranks = assignRanks(ordered.length + 1);
          for (let i = 0; i < ordered.length; i += 1) {
            await tx.channel.update({
              where: { id: ordered[i]!.id },
              data: { positionKey: ranks[i]! },
            });
          }
          positionKey = ranks[ordered.length]!;
        }
      }
      await tx.channel.update({
        where: { id: channel.id },
        data: { categoryId: input.categoryId, positionKey },
      });
    });

    const channelIds =
      input.categoryId === null
        ? (
            await this.prisma.channel.findMany({
              where: { serverId, categoryId: null },
              orderBy: { position: 'asc' },
              select: { id: true },
            })
          ).map((row) => row.id)
        : (
            await this.prisma.channel.findMany({
              where: { categoryId: input.categoryId },
              select: { id: true, positionKey: true },
            })
          )
            .sort((a, b) => compareRanks(a.positionKey ?? '', b.positionKey ?? ''))
            .map((row) => row.id);
    await this.audit.record({
      serverId,
      actorId,
      action: 'CHANNEL_REORDER',
      targetId: channel.id,
      metadata: {
        channelId: channel.id,
        fromCategoryId: channel.categoryId,
        toCategoryId: input.categoryId,
      },
    });
    const payload: ChannelReorderedPayload = {
      serverId,
      scope: 'category',
      categoryId: input.categoryId,
      channelIds,
    };
    this.realtime.emitToServer(serverId, ServerEvents.ChannelReordered, payload);
    const updated = await this.getChannel(channelId);
    return toChannelDto(updated, serverId);
  }

  async setTopic(channelId: string, topic: string): Promise<ChannelDto> {
    const channel = await this.getChannel(channelId);
    if (channel.serverId === null) throw new NotFoundException('Channel not found');
    const updated = await this.prisma.channel.update({
      where: { id: channel.id },
      data: { topic: topic === '' ? null : topic },
    });
    this.realtime.emitToServer(
      channel.serverId,
      ServerEvents.ChannelUpdated,
      toChannelDto(updated, channel.serverId),
    );
    return toChannelDto(updated, channel.serverId);
  }

  private async getChannel(channelId: string) {
    const channel = await this.prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) {
      throw new NotFoundException('Channel not found');
    }
    return channel;
  }
}
