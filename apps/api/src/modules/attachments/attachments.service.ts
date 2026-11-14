import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  StreamableFile,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  AttachmentLimits,
  ErrorCodes,
  type CreateUploadInput,
  type SignedFileQuery,
} from '@ping/shared';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import type { Env } from '../../config/env.schema.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AbilityFactory } from '../ability/ability.factory.js';
import { Storage } from './local-storage.js';

export const attachmentSelect = {
  id: true,
  filename: true,
  mime: true,
  sizeBytes: true,
  width: true,
  height: true,
} as const;

@Injectable()
export class AttachmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    private readonly ability: AbilityFactory,
    private readonly storage: Storage,
  ) {}

  async create(userId: string, input: CreateUploadInput) {
    let serverId: string | null = null;
    if (input.scope === 'message') {
      const channel = await this.prisma.channel.findUnique({ where: { id: input.channelId } });
      if (!channel) throw new NotFoundException();
      // Attachment tin DM có serverId NULL nên chỉ tính vào hạn mức USER.
      if (channel.type === 'DM') {
        const participant = await this.prisma.dmParticipant.findUnique({
          where: { channelId_userId: { channelId: channel.id, userId } },
          select: { userId: true },
        });
        if (!participant) throw new ForbiddenException();
      } else {
        if (channel.serverId === null) throw new NotFoundException();
        serverId = channel.serverId;
        const ability = await this.ability.createForUserFresh(channel.serverId, userId);
        if (!ability.can('create', 'Attachment')) throw new ForbiddenException();
      }
    } else if (input.scope === 'serverIcon') {
      serverId = input.serverId!;
      const ability = await this.ability.createForUserFresh(serverId, userId);
      if (!ability.can('update', 'Server')) throw new ForbiddenException();
    } else if (input.scope === 'sticker') {
      serverId = input.serverId!;
      const ability = await this.ability.createForUserFresh(serverId, userId);
      if (!ability.can('manage', 'Sticker')) throw new ForbiddenException();
    } else if (input.scope === 'customEmoji') {
      serverId = input.serverId!;
      const ability = await this.ability.createForUserFresh(serverId, userId);
      if (!ability.can('manage', 'Sticker')) throw new ForbiddenException();
    }
    return this.prisma.$transaction(async (tx) => {
      // Consistent order: user then server. Both scopes include pending reservations.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`upload-user:${userId}`}))`;
      if (serverId)
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`upload-server:${serverId}`}))`;
      const previous = await tx.attachment.findUnique({
        where: { uploaderId_nonce: { uploaderId: userId, nonce: input.nonce } },
      });
      if (previous) {
        if (
          previous.channelId !== (input.channelId ?? null) ||
          previous.serverId !== serverId ||
          previous.scope !== input.scope ||
          previous.filename !== input.filename ||
          previous.sizeBytes !== input.sizeBytes
        )
          throw new BadRequestException();
        return { id: previous.id, status: previous.status };
      }
      const active = ['pending', 'uploaded', 'queued', 'processing', 'ready', 'deleting'];
      const reservation = input.sizeBytes + AttachmentLimits.FILE_BYTES;
      const [user, server] = await Promise.all([
        input.scope === 'serverIcon'
          ? Promise.resolve({ _sum: { quotaBytes: 0 } })
          : tx.attachment.aggregate({
              where: { uploaderId: userId, status: { in: active } },
              _sum: { quotaBytes: true },
            }),
        serverId === null
          ? Promise.resolve({ _sum: { quotaBytes: 0 } })
          : tx.attachment.aggregate({
              where: { serverId, status: { in: active } },
              _sum: { quotaBytes: true },
            }),
      ]);
      if (
        (user._sum.quotaBytes ?? 0) + reservation >
          this.config.get('ATTACHMENT_USER_QUOTA_BYTES', { infer: true }) ||
        (server._sum.quotaBytes ?? 0) + reservation >
          this.config.get('ATTACHMENT_SERVER_QUOTA_BYTES', { infer: true })
      ) {
        throw new BadRequestException({
          code: ErrorCodes.UPLOAD_QUOTA_EXCEEDED,
          message: 'Attachment quota exceeded',
        });
      }
      const row = await tx.attachment.create({
        data: {
          ...input,
          channelId: input.scope === 'message' ? input.channelId : null,
          serverId,
          quotaBytes: reservation,
          uploaderId: userId,
        },
      });
      return { id: row.id, status: row.status };
    });
  }

  private async owned(id: string, userId: string) {
    const row = await this.prisma.attachment.findUnique({ where: { id } });
    if (!row || row.uploaderId !== userId) throw new NotFoundException();
    // Chỉ uploader đụng được upload avatar/sticker/emoji của mình; claim sticker/emoji kiểm `manage Sticker` ở Stickers/EmojisService.
    if (row.scope === 'avatar' || row.scope === 'sticker' || row.scope === 'customEmoji')
      return row;
    if (row.scope === 'serverIcon') {
      const ability = await this.ability.createForUserFresh(row.serverId!, userId);
      if (!ability.can('update', 'Server')) throw new ForbiddenException();
      return row;
    }
    if (row.serverId === null) {
      if (row.channelId === null) throw new NotFoundException();
      const participant = await this.prisma.dmParticipant.findUnique({
        where: { channelId_userId: { channelId: row.channelId, userId } },
        select: { userId: true },
      });
      if (!participant) throw new ForbiddenException();
      return row;
    }
    const ability = await this.ability.createForUserFresh(row.serverId, userId);
    if (!ability.can('create', 'Attachment')) throw new ForbiddenException();
    return row;
  }

  async upload(id: string, userId: string, req: Request) {
    const row = await this.owned(id, userId);
    if (req.headers['content-type']?.split(';')[0] !== 'application/octet-stream')
      throw new BadRequestException();
    const chunks: Buffer[] = [];
    let size = 0;
    const timer = setTimeout(() => req.destroy(), 30_000);
    try {
      for await (const chunk of req) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += bytes.length;
        if (size > row.sizeBytes || size > AttachmentLimits.FILE_BYTES)
          throw new BadRequestException({
            code: ErrorCodes.UPLOAD_INVALID,
            message: 'Invalid upload size',
          });
        chunks.push(bytes);
      }
    } finally {
      clearTimeout(timer);
    }
    if (size !== row.sizeBytes)
      throw new BadRequestException({
        code: ErrorCodes.UPLOAD_INVALID,
        message: 'Invalid upload size',
      });
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Attachment" WHERE id = ${id}::uuid FOR UPDATE`;
      const current = await tx.attachment.findUniqueOrThrow({ where: { id } });
      if (current.status !== 'pending') {
        if (['uploaded', 'queued', 'processing', 'ready'].includes(current.status))
          return { id, status: current.status };
        throw new BadRequestException();
      }
      if (current.createdAt.getTime() < Date.now() - 3_600_000) throw new BadRequestException();
      await this.storage.write(`${id}.raw`, Buffer.concat(chunks));
      await tx.attachment.update({ where: { id }, data: { status: 'uploaded' } });
      return { id, status: 'uploaded' };
    });
  }

  async complete(id: string, userId: string) {
    const row = await this.owned(id, userId);
    if (row.status === 'pending')
      throw new BadRequestException({
        code: ErrorCodes.ATTACHMENT_NOT_READY,
        message: 'Upload bytes first',
      });
    await this.prisma.attachment.updateMany({
      where: { id, status: 'uploaded' },
      data: { status: 'queued' },
    });
    return this.status(id, userId);
  }

  async status(id: string, userId: string) {
    const row = await this.owned(id, userId);
    const { id: attachmentId, filename, mime, sizeBytes, width, height } = row;
    return {
      id,
      status: row.status,
      attachment:
        row.status === 'ready'
          ? { id: attachmentId, filename, mime, sizeBytes, width, height }
          : null,
    };
  }

  async cancel(id: string, userId: string) {
    await this.owned(id, userId);
    await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Attachment" WHERE id = ${id}::uuid FOR UPDATE`;
      const row = await tx.attachment.findUniqueOrThrow({ where: { id } });
      if (row.messageId || row.boundAt) throw new BadRequestException();
      if (row.status !== 'deleted')
        await tx.attachment.update({ where: { id }, data: { status: 'deleting' } });
    });
    return { id };
  }

  async claimProfileAttachment(
    tx: Prisma.TransactionClient,
    userId: string,
    attachmentId: string,
    scope: 'avatar' | 'serverIcon' | 'sticker' | 'customEmoji',
  ) {
    await tx.$queryRaw`SELECT id FROM "Attachment" WHERE id = ${attachmentId}::uuid FOR UPDATE`;
    const row = await tx.attachment.findUnique({ where: { id: attachmentId } });
    if (
      !row ||
      row.scope !== scope ||
      row.uploaderId !== userId ||
      row.status !== 'ready' ||
      row.boundAt
    )
      throw new BadRequestException({
        code: row && row.boundAt ? ErrorCodes.ATTACHMENT_ALREADY_BOUND : ErrorCodes.BAD_REQUEST,
        message: 'Attachment is not claimable',
      });
    await tx.attachment.update({
      where: { id: attachmentId },
      data: { boundAt: new Date() },
    });
    return row;
  }

  async claimStickerAttachment(tx: Prisma.TransactionClient, userId: string, attachmentId: string) {
    return this.claimProfileAttachment(tx, userId, attachmentId, 'sticker');
  }

  async claimCustomEmojiAttachment(
    tx: Prisma.TransactionClient,
    userId: string,
    attachmentId: string,
  ) {
    return this.claimProfileAttachment(tx, userId, attachmentId, 'customEmoji');
  }

  async releaseProfileAttachment(tx: Prisma.TransactionClient, url: string | null) {
    if (!url) return;
    const id = /\/api\/v1\/attachments\/([0-9a-f-]{36})\/file/.exec(url)?.[1];
    if (!id) return;
    await tx.attachment.updateMany({
      where: { id, boundAt: { not: null } },
      data: { status: 'deleting' },
    });
  }

  private async downloadable(id: string, userId: string, thumbnail: boolean) {
    const row = await this.prisma.attachment.findUnique({
      where: { id },
      include: { message: { select: { deletedAt: true } } },
    });
    if (
      !row ||
      row.status !== 'ready' ||
      row.message?.deletedAt ||
      (!row.messageId && row.uploaderId !== userId) ||
      (thumbnail && !row.mime.startsWith('image/'))
    )
      throw new NotFoundException();
    const channel = await this.prisma.channel.findUnique({
      where: { id: row.channelId! },
      select: { id: true, serverId: true, type: true },
    });
    if (!channel) throw new NotFoundException();
    // Tin DM: chữ ký URL chỉ xác thực người ký, mỗi lần tải phải kiểm lại participant; người ngoài → 404.
    if (channel.type === 'DM') {
      const participant = await this.prisma.dmParticipant.findUnique({
        where: { channelId_userId: { channelId: channel.id, userId } },
        select: { userId: true },
      });
      if (!participant) throw new NotFoundException();
      return row;
    }
    if (channel.serverId === null) throw new NotFoundException();
    const ability = await this.ability.createForUserFresh(channel.serverId, userId);
    if (!ability.can('view', 'Attachment')) throw new ForbiddenException();
    return row;
  }

  private sign(id: string, user: string, expires: number, thumbnail: boolean) {
    return createHmac('sha256', this.config.get('JWT_ACCESS_SECRET', { infer: true }))
      .update(`attachment-v1:${id}:${user}:${expires}:${thumbnail ? 'thumb' : 'ready'}`)
      .digest('hex');
  }
  async link(id: string, userId: string, thumbnail: boolean) {
    await this.downloadable(id, userId, thumbnail);
    const expires = Math.floor(Date.now() / 1000) + AttachmentLimits.URL_SECONDS;
    const signature = this.sign(id, userId, expires, thumbnail);
    return {
      url: `/api/v1/attachments/${id}/file?user=${userId}&expires=${expires}&signature=${signature}${thumbnail ? '&thumbnail=1' : ''}`,
      expiresAt: new Date(expires * 1000).toISOString(),
    };
  }

  /** KHÔNG ràng buộc người xem (bearer capability): chỉ scope avatar/serverIcon, ảnh đã reencode. */
  private profileSign(id: string, expires: number, thumbnail: boolean) {
    return createHmac('sha256', this.config.get('JWT_ACCESS_SECRET', { infer: true }))
      .update(`attachment-profile-v1:${id}:${expires}:${thumbnail ? 'thumb' : 'ready'}`)
      .digest('hex');
  }

  // Làm tròn XUỐNG ô 1 giờ để URL ổn định (không đổi `src` của <img>) và vẫn qua kiểm tra `expires` ở `file()`.
  private profileExpires(): number {
    const bucket = 60 * 60;
    return Math.floor(Date.now() / 1000 / bucket) * bucket + AttachmentLimits.PROFILE_URL_SECONDS;
  }

  async profileLink(id: string, thumbnail: boolean) {
    const row = await this.prisma.attachment.findUnique({ where: { id } });
    if (!row || row.scope === 'message' || row.status !== 'ready') throw new NotFoundException();
    const expires = this.profileExpires();
    const signature = this.profileSign(id, expires, thumbnail);
    return {
      url: `/api/v1/attachments/${id}/file?expires=${expires}&signature=${signature}${thumbnail ? '&thumbnail=1' : ''}`,
      expiresAt: new Date(expires * 1000).toISOString(),
    };
  }

  async stickerUrls(id: string): Promise<{ url: string; previewUrl: string }> {
    const row = await this.prisma.attachment.findUnique({ where: { id } });
    if (!row || row.scope !== 'sticker' || row.status !== 'ready') throw new NotFoundException();
    const expires = this.profileExpires();
    return {
      url: `/api/v1/attachments/${id}/file?expires=${expires}&signature=${this.profileSign(id, expires, false)}`,
      previewUrl: `/api/v1/attachments/${id}/file?expires=${expires}&signature=${this.profileSign(id, expires, true)}&thumbnail=1`,
    };
  }

  async stickerUrlsMany(ids: string[]): Promise<Map<string, { url: string; previewUrl: string }>> {
    return this.expressionUrlsMany(ids, 'sticker');
  }

  async emojiUrls(id: string): Promise<{ url: string; previewUrl: string }> {
    const row = await this.prisma.attachment.findUnique({ where: { id } });
    if (!row || row.scope !== 'customEmoji' || row.status !== 'ready')
      throw new NotFoundException();
    const expires = this.profileExpires();
    return {
      url: `/api/v1/attachments/${id}/file?expires=${expires}&signature=${this.profileSign(id, expires, false)}`,
      previewUrl: `/api/v1/attachments/${id}/file?expires=${expires}&signature=${this.profileSign(id, expires, true)}&thumbnail=1`,
    };
  }

  async emojiUrlsMany(ids: string[]): Promise<Map<string, { url: string; previewUrl: string }>> {
    return this.expressionUrlsMany(ids, 'customEmoji');
  }

  private async expressionUrlsMany(
    ids: string[],
    scope: 'sticker' | 'customEmoji',
  ): Promise<Map<string, { url: string; previewUrl: string }>> {
    const map = new Map<string, { url: string; previewUrl: string }>();
    if (ids.length === 0) return map;
    const rows = await this.prisma.attachment.findMany({
      where: { id: { in: ids }, scope, status: 'ready' },
      select: { id: true },
    });
    const expires = this.profileExpires();
    for (const { id } of rows) {
      map.set(id, {
        url: `/api/v1/attachments/${id}/file?expires=${expires}&signature=${this.profileSign(id, expires, false)}`,
        previewUrl: `/api/v1/attachments/${id}/file?expires=${expires}&signature=${this.profileSign(id, expires, true)}&thumbnail=1`,
      });
    }
    return map;
  }

  private async profileRow(id: string, thumbnail: boolean) {
    const row = await this.prisma.attachment.findUnique({ where: { id } });
    if (
      !row ||
      row.scope === 'message' ||
      row.status !== 'ready' ||
      (thumbnail && !row.mime.startsWith('image/'))
    )
      throw new NotFoundException();
    return row;
  }

  async file(id: string, query: SignedFileQuery, res: Response) {
    const thumbnail = query.thumbnail === '1';
    const now = Math.floor(Date.now() / 1000);
    if (query.user === undefined) {
      const expected = this.profileSign(id, query.expires, thumbnail);
      if (
        query.expires <= now ||
        query.expires > now + AttachmentLimits.PROFILE_URL_SECONDS ||
        !timingSafeEqual(Buffer.from(query.signature), Buffer.from(expected))
      )
        throw new ForbiddenException();
      const row = await this.profileRow(id, thumbnail);
      return this.stream(row, thumbnail, res);
    }
    const expected = this.sign(id, query.user, query.expires, thumbnail);
    if (
      query.expires <= now ||
      query.expires > now + AttachmentLimits.URL_SECONDS ||
      !timingSafeEqual(Buffer.from(query.signature), Buffer.from(expected))
    )
      throw new ForbiddenException();
    const row = await this.downloadable(id, query.user, thumbnail);
    return this.stream(row, thumbnail, res);
  }

  private async stream(
    row: { id: string; filename: string; mime: string },
    thumbnail: boolean,
    res: Response,
  ) {
    const bytes = await this.storage.read(`${row.id}.${thumbnail ? 'thumb' : 'ready'}`);
    const filename = `${row.filename.replace(/\.[^.]*$/, '')}.${row.mime.startsWith('image/') ? 'webp' : 'pdf'}`;
    res.setHeader(
      'Content-Disposition',
      `${row.mime.startsWith('image/') ? 'inline' : 'attachment'}; filename="attachment"; filename*=UTF-8''${encodeURIComponent(filename).replace(/'/g, '%27')}`,
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    return new StreamableFile(bytes, { type: row.mime, length: bytes.length });
  }
}
