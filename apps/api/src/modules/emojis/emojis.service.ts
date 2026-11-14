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

  // animated suy từ metadata pages > 1 của tệp .ready: mime image/webp không phân biệt tĩnh/động.
  // Idempotent theo tệp: attachmentId đã boundAt → trả emoji cũ; gắn server khác → không lộ.
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

  private async readAnimated(attachmentId: string): Promise<boolean> {
    const bytes = await this.storage.read(`${attachmentId}.ready`);
    const meta = await sharp(bytes, { animated: true }).metadata();
    return (meta.pages ?? 1) > 1;
  }
}
