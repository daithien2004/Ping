import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  ErrorCodes,
  Limits,
  ServerEvents,
  type CreateStickerInput,
  type StickerDto,
  type StickerListResponse,
  type StickerPackDto,
} from '@ping/shared';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AttachmentsService } from '../attachments/attachments.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';

type StickerWithPack = {
  id: string;
  packId: string;
  name: string;
  tags: string[];
  attachmentId: string;
  deletedAt: Date | null;
  attachment: { id: string; width: number | null; height: number | null };
};

function toStickerDto(row: StickerWithPack, urls: { url: string; previewUrl: string }): StickerDto {
  return {
    id: row.id,
    packId: row.packId,
    name: row.name,
    tags: row.tags,
    url: urls.url,
    previewUrl: urls.previewUrl,
    width: row.attachment.width,
    height: row.attachment.height,
  };
}

@Injectable()
export class StickersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attachments: AttachmentsService,
    private readonly audit: AuditService,
    private readonly realtime: RealtimeService,
  ) {}

  // Idempotent theo tệp: attachmentId đã boundAt → trả sticker cũ; gắn server khác → không lộ.
  async create(serverId: string, userId: string, input: CreateStickerInput): Promise<StickerDto> {
    try {
      const { sticker } = await this.prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`sticker-server:${serverId}`}))`;
        let pack = await tx.stickerPack.findFirst({
          where: { serverId },
          orderBy: { position: 'asc' },
          select: { id: true },
        });
        if (!pack) {
          pack = await tx.stickerPack.create({
            data: { serverId, name: 'Stickers' },
            select: { id: true },
          });
        }
        const count = await tx.sticker.count({
          where: { pack: { serverId }, deletedAt: null },
        });
        if (count >= Limits.STICKERS_PER_SERVER) {
          throw new BadRequestException({
            code: ErrorCodes.STICKER_LIMIT_REACHED,
            message: `At most ${Limits.STICKERS_PER_SERVER} stickers per server`,
          });
        }
        const attachment = await this.attachments.claimStickerAttachment(
          tx,
          userId,
          input.attachmentId,
        );
        const sticker = await tx.sticker.create({
          data: {
            packId: pack.id,
            name: input.name,
            tags: input.tags ?? [],
            attachmentId: input.attachmentId,
            createdBy: userId,
          },
        });
        return {
          sticker: {
            ...sticker,
            attachment: { id: attachment.id, width: attachment.width, height: attachment.height },
          } satisfies StickerWithPack,
        };
      });
      this.realtime.emitToServer(serverId, ServerEvents.ExpressionsUpdated, { serverId });
      return toStickerDto(sticker, await this.attachments.stickerUrls(input.attachmentId));
    } catch (error) {
      if (
        error instanceof BadRequestException &&
        (error.getResponse() as { code?: string }).code === ErrorCodes.ATTACHMENT_ALREADY_BOUND
      ) {
        const existing = await this.prisma.sticker.findFirst({
          where: { attachmentId: input.attachmentId, deletedAt: null, pack: { serverId } },
        });
        if (existing) return this.one(existing.id);
      }
      throw error;
    }
  }

  async list(serverId: string): Promise<StickerListResponse> {
    const packs = await this.prisma.stickerPack.findMany({
      where: { OR: [{ serverId: null }, { serverId }] },
      orderBy: [{ serverId: 'asc' }, { position: 'asc' }, { id: 'asc' }],
      include: {
        stickers: {
          where: { deletedAt: null },
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            packId: true,
            name: true,
            tags: true,
            attachmentId: true,
            attachment: { select: { id: true, width: true, height: true } },
          },
        },
      },
    });
    const urls = await this.attachments.stickerUrlsMany(
      packs.flatMap((pack) => pack.stickers.map((sticker) => sticker.attachmentId)),
    );
    const mapped: StickerPackDto[] = packs.map((pack) => ({
      id: pack.id,
      name: pack.name,
      serverId: pack.serverId,
      stickers: pack.stickers.map((sticker) =>
        toStickerDto(
          { ...sticker, deletedAt: null },
          urls.get(sticker.attachmentId) ?? { url: '', previewUrl: '' },
        ),
      ),
    }));
    return { packs: mapped };
  }

  async remove(stickerId: string, userId: string): Promise<{ id: string }> {
    const sticker = await this.prisma.sticker.findUnique({
      where: { id: stickerId },
      include: { pack: { select: { serverId: true } } },
    });
    if (!sticker || sticker.deletedAt) throw new NotFoundException('Sticker not found');
    if (!sticker.pack.serverId) throw new ForbiddenException('System stickers cannot be deleted');
    const serverId = sticker.pack.serverId;
    await this.prisma.$transaction(async (tx) => {
      await tx.sticker.update({ where: { id: stickerId }, data: { deletedAt: new Date() } });
      await this.audit.record(
        {
          serverId,
          actorId: userId,
          action: 'STICKER_DELETE',
          targetId: stickerId,
          metadata: { name: sticker.name, packId: sticker.packId },
        },
        tx,
      );
      await tx.attachment.updateMany({
        where: { id: sticker.attachmentId, boundAt: { not: null } },
        data: { status: 'deleting' },
      });
    });
    this.realtime.emitToServer(serverId, ServerEvents.ExpressionsUpdated, { serverId });
    return { id: stickerId };
  }

  private async one(id: string): Promise<StickerDto> {
    const row = await this.prisma.sticker.findUnique({
      where: { id },
      select: {
        id: true,
        packId: true,
        name: true,
        tags: true,
        attachmentId: true,
        deletedAt: true,
        attachment: { select: { id: true, width: true, height: true } },
      },
    });
    if (!row) throw new NotFoundException('Sticker not found');
    return toStickerDto(row, await this.attachments.stickerUrls(row.attachmentId));
  }
}
