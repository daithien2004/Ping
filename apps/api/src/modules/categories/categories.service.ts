import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  Limits,
  ServerEvents,
  after,
  rankBetween,
  type ChannelCategoryDto,
  type ReorderCategoriesInput,
} from '@ping/shared';
import { limitReached } from '../../common/limit-reached.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { assignRanks } from './ranks.js';

@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
  ) {}

  async create(serverId: string, name: string): Promise<ChannelCategoryDto> {
    const created = await this.prisma.$transaction(async (tx) => {
      // Khóa 'cat:' tách khỏi khóa position Int của channel; request tạo đồng thời xếp hàng.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'cat:' + serverId}))`;
      // Đếm trong lock để trần chính xác.
      if (
        (await tx.channelCategory.count({ where: { serverId } })) >=
        Limits.MAX_CATEGORIES_PER_SERVER
      ) {
        throw limitReached('categories', Limits.MAX_CATEGORIES_PER_SERVER);
      }
      const last = await tx.channelCategory.findFirst({
        where: { serverId },
        orderBy: { position: 'desc' },
      });
      const position = last ? after(last.position) : rankBetween(undefined, undefined);
      if (position === null) {
        const all = await tx.channelCategory.findMany({
          where: { serverId },
          orderBy: { position: 'asc' },
          select: { id: true },
        });
        const ranks = assignRanks(all.length + 1);
        for (let i = 0; i < all.length; i += 1) {
          await tx.channelCategory.update({
            where: { id: all[i]!.id },
            data: { position: ranks[i]! },
          });
        }
        return tx.channelCategory.create({
          data: { serverId, name, position: ranks[all.length]! },
        });
      }
      return tx.channelCategory.create({ data: { serverId, name, position } });
    });
    await this.emitCategoriesReordered(serverId);
    return { id: created.id, name: created.name, position: created.position };
  }

  async rename(serverId: string, categoryId: string, name: string): Promise<ChannelCategoryDto> {
    // Tra theo cả serverId: categoryId của server khác → 404.
    const category = await this.prisma.channelCategory.findFirst({
      where: { id: categoryId, serverId },
    });
    if (!category) throw new NotFoundException('Category not found');
    const updated = await this.prisma.channelCategory.update({
      where: { id: category.id },
      data: { name },
    });
    return { id: updated.id, name: updated.name, position: updated.position };
  }

  async remove(serverId: string, categoryId: string): Promise<{ id: string }> {
    const category = await this.prisma.channelCategory.findFirst({
      where: { id: categoryId, serverId },
    });
    if (!category) throw new NotFoundException('Category not found');
    await this.prisma.$transaction([
      this.prisma.channel.updateMany({
        where: { categoryId: category.id },
        data: { categoryId: null, positionKey: null },
      }),
      this.prisma.channelCategory.delete({ where: { id: category.id } }),
    ]);
    await this.emitCategoriesReordered(serverId);
    return { id: category.id };
  }

  async reorder(
    serverId: string,
    actorId: string,
    { orderedIds }: ReorderCategoriesInput,
  ): Promise<ChannelCategoryDto[]> {
    const { updated } = await this.prisma.$transaction(async (tx) => {
      const categories = await tx.channelCategory.findMany({
        where: { serverId },
        orderBy: { position: 'asc' },
      });
      const message = 'orderedIds must contain every category of the server exactly once';
      if (
        new Set(orderedIds).size !== orderedIds.length ||
        orderedIds.length !== categories.length
      ) {
        throw new BadRequestException(message);
      }
      const known = new Map(categories.map((category) => [category.id, category]));
      if (orderedIds.some((id) => !known.has(id))) {
        throw new BadRequestException(message);
      }
      if (categories.every((category, index) => category.id === orderedIds[index])) {
        return { updated: categories.map((category) => this.toDto(category)) };
      }
      let ranks: string[] = [];
      let rebalance = false;
      let prev: string | undefined;
      for (let i = 0; i < orderedIds.length; i += 1) {
        const rank = rankBetween(prev, undefined);
        if (rank === null) {
          rebalance = true;
          break;
        }
        ranks.push(rank);
        prev = rank;
      }
      if (rebalance) ranks = assignRanks(orderedIds.length);
      for (let i = 0; i < orderedIds.length; i += 1) {
        await tx.channelCategory.update({
          where: { id: orderedIds[i]! },
          data: { position: ranks[i]! },
        });
      }
      await this.audit.record(
        {
          serverId,
          actorId,
          action: 'CHANNEL_REORDER',
          metadata: { categoryIds: orderedIds },
        },
        tx,
      );
      return {
        updated: orderedIds.map((id, index) =>
          this.toDto({ ...known.get(id)!, position: ranks[index]! }),
        ),
      };
    });
    await this.emitCategoriesReordered(serverId);
    return updated;
  }

  private async emitCategoriesReordered(serverId: string): Promise<void> {
    const categories = await this.prisma.channelCategory.findMany({
      where: { serverId },
      orderBy: { position: 'asc' },
      select: { id: true },
    });
    this.realtime.emitToServer(serverId, ServerEvents.ChannelReordered, {
      serverId,
      scope: 'categories',
      // scope 'categories': mảng này là các categoryId.
      channelIds: categories.map((category) => category.id),
    });
  }

  private toDto(category: { id: string; name: string; position: string }): ChannelCategoryDto {
    return { id: category.id, name: category.name, position: category.position };
  }
}
