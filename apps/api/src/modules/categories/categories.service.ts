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

/**
 * Category channel (TG.10): CRUD + reorder. Vị trí là lexorank so sánh theo chuỗi
 * (packages/shared/src/lexorank.ts) — chèn giữa hai nhóm chỉ đụng MỘT hàng, nên kéo thả của
 * hai người dùng đồng thời không đánh số lại hàng loạt; chỉ khi `rankBetween` cạn khoảng
 * (hiếm) mới gán lại đều cả nhóm bằng `assignRanks`.
 *
 * Quyền đã do guard kiểm (`manage Channel` = MANAGE_CHANNELS — cùng quyền với tạo/xóa
 * channel, vì category chỉ là cách nhóm kênh). Audit: chỉ ghi CHANNEL_REORDER cho
 * reorder/move channel — tạo/đổi tên category là dữ liệu hiển thị, hoàn toàn có thể hoàn tác
 * qua chính nó và thấy ngay trong UI (không thuộc nhóm hành động nhạy cảm của quy tắc 11);
 * xóa category không phá dữ liệu nào (kênh được giữ, về vùng mặc định) nên cũng không ghi.
 */
@Injectable()
export class CategoriesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
  ) {}

  async create(serverId: string, name: string): Promise<ChannelCategoryDto> {
    const created = await this.prisma.$transaction(async (tx) => {
      // Khóa riêng cho category của server (tiền tố 'cat:' để không đụng khóa position Int
      // của channel): hai request tạo category cùng lúc xếp hàng thay vì cùng đọc một max
      // rồi cùng nối cuối.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'cat:' + serverId}))`;
      // Đếm TRONG lock nên trần chính xác (mẫu của ChannelsService.create).
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
        // after() chỉ cạn với chuỗi rỗng — rank không bao giờ rỗng; nhánh này là lưới an toàn
        // cho dữ liệu lệch: gán lại đều toàn bộ category hiện có rồi nối category mới cuối.
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
    // Danh sách category đổi (thêm phần tử): báo room server để tab khác fetch lại —
    // client không cần biết category mới nằm đâu, payload chỉ mang thứ tự id mới.
    await this.emitCategoriesReordered(serverId);
    return { id: created.id, name: created.name, position: created.position };
  }

  async rename(serverId: string, categoryId: string, name: string): Promise<ChannelCategoryDto> {
    // Tra theo cả serverId: categoryId của server khác gắn vào URL — 404 che tồn tại.
    const category = await this.prisma.channelCategory.findFirst({
      where: { id: categoryId, serverId },
    });
    if (!category) throw new NotFoundException('Category not found');
    const updated = await this.prisma.channelCategory.update({
      where: { id: category.id },
      data: { name },
    });
    // Đổi tên không đổi thứ tự/chọn lọc gì: các tab khác sẽ thấy qua refetch detail của
    // chính họ (web refetch sau thao tác của mình) — không phát event cho một trường hiển thị.
    return { id: updated.id, name: updated.name, position: updated.position };
  }

  /**
   * Xóa category: kênh trong đó được GIỮ nguyên (về vùng mặc định) — đặt categoryId +
   * positionKey null trong cùng transaction, giữ `position` Int cũ nên kênh trở lại đúng
   * chỗ cũ của vùng mặc định. FK cũng khai báo ON DELETE SET NULL làm lưới an toàn.
   */
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

  /**
   * Sắp lại TOÀN BỘ category theo `orderedIds` (đã validate: đủ mọi category, không trùng).
   * Đúng thứ tự hiện có → không ghi gì (idempotent, không đánh số lại hàng loạt). Đổi thứ
   * tự → gán rank nối tiếp theo mảng (mỗi rank > rank trước); chỉ khi `rankBetween` cạn
   * khoảng thì gán lại ĐỀU cả danh sách bằng assignRanks (rebalance — xem ranks.ts).
   */
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
      // Đã đúng thứ tự → không có gì để làm (đòi hỏi "idempotent" của TG.10).
      if (categories.every((category, index) => category.id === orderedIds[index])) {
        return { updated: categories.map((category) => this.toDto(category)) };
      }
      // Gán nối tiếp: mốc trái là rank vừa gán, mốc phải trống (nối cuối danh sách).
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

  /** Danh sách id category theo thứ tự hiện tại, phát `channel.reordered` scope 'categories'. */
  private async emitCategoriesReordered(serverId: string): Promise<void> {
    const categories = await this.prisma.channelCategory.findMany({
      where: { serverId },
      orderBy: { position: 'asc' },
      select: { id: true },
    });
    this.realtime.emitToServer(serverId, ServerEvents.ChannelReordered, {
      serverId,
      scope: 'categories',
      // Hợp đồng ChannelReorderedPayload: scope 'categories' → mảng này là CÁC CATEGORYID.
      channelIds: categories.map((category) => category.id),
    });
  }

  private toDto(category: { id: string; name: string; position: string }): ChannelCategoryDto {
    return { id: category.id, name: category.name, position: category.position };
  }
}
