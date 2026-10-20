import { ForbiddenError, subject } from '@casl/ability';
import { Injectable, NotFoundException } from '@nestjs/common';
import { ServerEvents, type AppAbility, type CreateMessageInput } from '@ping/shared';
import { isUniqueConstraintError } from '../../common/utils/prisma-errors.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.module.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { MessageRateLimiter } from './message-rate-limiter.js';
import type { ListMessagesQuery } from './schemas.js';

/** Chỉ các trường client cần — không bao giờ trả bản ghi thô (guide 10.3). */
const messageWithAuthor = {
  id: true,
  content: true,
  nonce: true,
  editedAt: true,
  createdAt: true,
  authorId: true,
  author: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
} as const;

@Injectable()
export class MessagesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly realtime: RealtimeService,
    private readonly audit: AuditService,
    private readonly rateLimiter: MessageRateLimiter,
  ) {}

  /**
   * Phân trang cursor/keyset (guide 10.3): WHERE id < before ORDER BY id DESC.
   * Nhảy thẳng tới đúng vị trí trong index (channelId, id desc) — không đọc rồi
   * vứt hàng chục nghìn row như OFFSET. Lấy dư 1 để biết còn trang cũ hơn không.
   */
  async list(channelId: string, query: ListMessagesQuery) {
    const messages = await this.prisma.message.findMany({
      where: {
        channelId,
        // Tin soft-delete biến mất khỏi lịch sử nhưng vẫn nằm trong DB.
        deletedAt: null,
        ...(query.before ? { id: { lt: query.before } } : {}),
      },
      orderBy: { id: 'desc' },
      take: query.limit + 1,
      select: messageWithAuthor,
    });

    const hasMore = messages.length > query.limit;
    return { messages: hasMore ? messages.slice(0, query.limit) : messages, hasMore };
  }

  async create(channelId: string, authorId: string, input: CreateMessageInput) {
    await this.rateLimiter.consume(authorId, channelId);
    try {
      const message = await this.prisma.message.create({
        data: { channelId, authorId, content: input.content, nonce: input.nonce },
        select: messageWithAuthor,
      });
      this.realtime.emitToChannel(channelId, ServerEvents.MessageCreated, {
        id: message.id,
        channelId,
        authorId,
        author: message.author,
        content: message.content,
        createdAt: message.createdAt.toISOString(),
        nonce: message.nonce,
      });
      return message;
    } catch (error) {
      // Client retry (mạng chập chờn) gửi lại CÙNG nonce → unique
      // (channelId, authorId, nonce) chặn ghi trùng: trả đúng tin cũ thay vì lỗi.
      // Không phát event lần hai vì client khác đã nhận tin này từ lần tạo đầu.
      if (isUniqueConstraintError(error)) {
        return this.prisma.message.findUniqueOrThrow({
          where: { channelId_authorId_nonce: { channelId, authorId, nonce: input.nonce } },
          select: messageWithAuthor,
        });
      }
      throw error;
    }
  }

  async update(messageId: string, ability: AppAbility, content: string) {
    const message = await this.getMessage(messageId);
    // Tier 2 (guide 10.2): rule "update Message WHERE authorId = me" chỉ kiểm
    // tra được khi đã có đối tượng thật trong tay.
    ForbiddenError.from(ability).throwUnlessCan('update', subject('Message', message));

    const updated = await this.prisma.message.update({
      where: { id: message.id },
      data: { content, editedAt: new Date() },
      select: messageWithAuthor,
    });

    this.realtime.emitToChannel(message.channelId, ServerEvents.MessageUpdated, {
      id: updated.id,
      channelId: message.channelId,
      content: updated.content,
      updatedAt: (updated.editedAt ?? updated.createdAt).toISOString(),
    });

    return updated;
  }

  async remove(messageId: string, actorId: string, ability: AppAbility): Promise<{ id: string }> {
    const message = await this.getMessage(messageId);
    // Tác giả được xóa tin của mình; ai có MANAGE_MESSAGES xóa được tin người khác.
    ForbiddenError.from(ability).throwUnlessCan('delete', subject('Message', message));

    // Soft delete: moderation cần lịch sử, và client cần event message.deleted
    // — row phải còn để biết nó từng tồn tại.
    const softDelete = this.prisma.message.update({
      where: { id: message.id },
      data: { deletedAt: new Date() },
    });
    if (message.authorId === actorId) {
      await softDelete;
    } else {
      // Xóa tin của người khác là hành động moderation: phải có AuditLog (quy tắc 11).
      const { serverId } = await this.prisma.channel.findUniqueOrThrow({
        where: { id: message.channelId },
        select: { serverId: true },
      });
      await this.prisma.$transaction([
        softDelete,
        this.audit.record({
          serverId,
          actorId,
          action: 'MESSAGE_DELETE',
          targetId: message.id,
          metadata: { authorId: message.authorId, channelId: message.channelId },
        }),
      ]);
    }

    this.realtime.emitToChannel(message.channelId, ServerEvents.MessageDeleted, {
      id: message.id,
      channelId: message.channelId,
    });

    return { id: message.id };
  }

  private async getMessage(messageId: string) {
    // Tin đã xóa mềm coi như không còn: không sửa/xóa lại được.
    const message = await this.prisma.message.findFirst({
      where: { id: messageId, deletedAt: null },
    });
    if (!message) {
      throw new NotFoundException('Message not found');
    }
    return message;
  }
}
