import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ErrorCodes,
  Limits,
  ServerEvents,
  type CreateCustomEmojiInput,
  type CustomEmojiDto,
  type CustomEmojiListResponse,
} from '@ping/shared';
import sharp from 'sharp';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AttachmentsService } from '../attachments/attachments.service.js';
import { Storage } from '../attachments/local-storage.js';
import { RealtimeService } from '../realtime/realtime.service.js';

type CustomEmojiRow = {
  id: string;
  name: string;
  animated: boolean;
  attachmentId: string;
  deletedAt: Date | null;
  attachment: { id: string; width: number | null; height: number | null };
};

/** Hàng CustomEmoji + attachment → DTO với cặp URL hồ sơ (bản chính + khung tĩnh). */
function toCustomEmojiDto(
  row: CustomEmojiRow,
  urls: { url: string; previewUrl: string },
): CustomEmojiDto {
  return {
    id: row.id,
    name: row.name,
    animated: row.animated,
    url: urls.url,
    previewUrl: urls.previewUrl,
    width: row.attachment.width,
    height: row.attachment.height,
  };
}

@Injectable()
export class EmojisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attachments: AttachmentsService,
    private readonly storage: Storage,
    private readonly realtime: RealtimeService,
    private readonly audit: AuditService,
  ) {}

  /**
   * Tạo emoji tùy chỉnh (TG.24, ADR-0068): claim tệp đã kiểm định (scope customEmoji,
   * WebP ≤128×128) + tạo hàng CustomEmoji + giữ trần `Limits.EMOJIS_STATIC/ANIMATED_PER_SERVER`
   * dưới advisory lock theo server (pattern trần sticker TG.22). Không bảng gói — emoji
   * của server phẳng.
   *
   * Cờ `animated` suy từ tệp `.ready` đã reencode (metadata `pages > 1` cho WebP động):
   * worker không có cột riêng và mime `image/webp` không phân biệt tĩnh/động. Tệp ≤256 KiB
   * nên đọc metadata rất rẻ — chỉ chạy lúc upload (hiếm), không truy vấn thêm DB.
   *
   * Idempotent theo tệp (quy tắc 12, pattern sticker): client retry cùng `attachmentId`
   * sau khi lần đầu đã commit → tệp đã `boundAt` → trả lại emoji cũ thay vì lỗi; tệp đã
   * gắn vào server khác thì không trả gì (không lộ).
   */
  async create(
    serverId: string,
    userId: string,
    input: CreateCustomEmojiInput,
  ): Promise<CustomEmojiDto> {
    try {
      const { emoji } = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`emoji-server:${serverId}`}))`;
        const attachment = await this.attachments.claimCustomEmojiAttachment(
          tx,
          userId,
          input.attachmentId,
        );
        const animated = await this.readAnimated(input.attachmentId);
        // Trần theo bucket tĩnh/động (ADR-0068 mục 2): xóa mềm giải phóng chỉ tiêu.
        const count = await tx.customEmoji.count({
          where: { serverId, deletedAt: null, animated },
        });
        const max = animated ? Limits.EMOJIS_ANIMATED_PER_SERVER : Limits.EMOJIS_STATIC_PER_SERVER;
        if (count >= max) {
          throw new BadRequestException({
            code: ErrorCodes.EMOJI_LIMIT_REACHED,
            message: `At most ${max} ${animated ? 'animated' : 'static'} emojis per server`,
            details: { bucket: animated ? 'animated' : 'static' },
          });
        }
        const emoji = await tx.customEmoji.create({
          data: {
            serverId,
            name: input.name,
            animated,
            attachmentId: input.attachmentId,
            createdBy: userId,
          },
        });
        return {
          emoji: {
            ...emoji,
            attachment: { id: attachment.id, width: attachment.width, height: attachment.height },
          } satisfies CustomEmojiRow,
        };
      });
      this.realtime.emitToServer(serverId, ServerEvents.ExpressionsUpdated, { serverId });
      return toCustomEmojiDto(emoji, await this.attachments.emojiUrls(input.attachmentId));
    } catch (error) {
      if (
        error instanceof BadRequestException &&
        (error.getResponse() as { code?: string }).code === ErrorCodes.ATTACHMENT_ALREADY_BOUND
      ) {
        const existing = await this.prisma.customEmoji.findFirst({
          where: { attachmentId: input.attachmentId, deletedAt: null, serverId },
        });
        if (existing) return this.one(existing.id);
      }
      throw error;
    }
  }

  /**
   * Danh sách emoji cho picker/quản trị (TG.24): toàn bộ emoji còn sống của server, mới
   * tạo trước không — thứ tự ổn định theo createdAt để picker không nhảy. Trần 50+50 →
   * trả mảng thẳng, không phân trang.
   */
  async list(serverId: string): Promise<CustomEmojiListResponse> {
    const rows = await this.prisma.customEmoji.findMany({
      where: { serverId, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true,
        name: true,
        animated: true,
        attachmentId: true,
        attachment: { select: { id: true, width: true, height: true } },
      },
    });
    const urls = await this.attachments.emojiUrlsMany(rows.map((row) => row.attachmentId));
    return {
      emojis: rows.map((row) =>
        toCustomEmojiDto(
          { ...row, deletedAt: null },
          urls.get(row.attachmentId) ?? { url: '', previewUrl: '' },
        ),
      ),
    };
  }

  /**
   * Xóa emoji (TG.24): soft-delete để token `:ten:<id>` trong tin cũ render placeholder
   * (ADR-0068 mục 3), phát hành tệp (worker dọn theo scope) và ghi audit `EMOJI_DELETE` —
   * xóa tài nguyên người khác tạo là hành động quản trị (quy tắc 11). Emoji đã xóa → 404.
   */
  async remove(emojiId: string, userId: string): Promise<{ id: string }> {
    const emoji = await this.prisma.customEmoji.findUnique({ where: { id: emojiId } });
    if (!emoji || emoji.deletedAt) throw new NotFoundException('Emoji not found');
    await this.prisma.$transaction(async (tx) => {
      await tx.customEmoji.update({
        where: { id: emojiId },
        data: { deletedAt: new Date() },
      });
      await this.audit.record(
        {
          serverId: emoji.serverId,
          actorId: userId,
          action: 'EMOJI_DELETE',
          targetId: emojiId,
          metadata: { name: emoji.name },
        },
        tx,
      );
      // Pattern `releaseProfileAttachment` (TG.7): tệp đã gắn → worker dọn và giải phóng hạn mức.
      await tx.attachment.updateMany({
        where: { id: emoji.attachmentId, boundAt: { not: null } },
        data: { status: 'deleting' },
      });
    });
    this.realtime.emitToServer(emoji.serverId, ServerEvents.ExpressionsUpdated, {
      serverId: emoji.serverId,
    });
    return { id: emojiId };
  }

  /** Emoji còn sống (cho path idempotent); đã xóa/không tồn tại → 404. */
  private async one(id: string): Promise<CustomEmojiDto> {
    const row = await this.prisma.customEmoji.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        animated: true,
        attachmentId: true,
        deletedAt: true,
        attachment: { select: { id: true, width: true, height: true } },
      },
    });
    if (!row || row.deletedAt) throw new NotFoundException('Emoji not found');
    return toCustomEmojiDto(row, await this.attachments.emojiUrls(row.attachmentId));
  }

  /**
   * Số khung của tệp `.ready` (WebP) — ảnh động có `pages > 1`. Đọc ngay trong transaction
   * tạo: nếu tệp chưa sẵn sàng thì `claim` đã chặn trước đó (status phải là `ready`).
   */
  private async readAnimated(attachmentId: string): Promise<boolean> {
    const bytes = await this.storage.read(`${attachmentId}.ready`);
    const meta = await sharp(bytes, { animated: true }).metadata();
    return (meta.pages ?? 1) > 1;
  }
}
