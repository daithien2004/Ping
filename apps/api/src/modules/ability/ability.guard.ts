import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { defineDmAbilityFor, type Actions, type AppAbility, type Subjects } from '@ping/shared';
import type { Request } from 'express';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { AuthenticatedUser } from '../auth/current-user.decorator.js';
import { AbilityFactory } from './ability.factory.js';
import { CHECK_ABILITY_KEY } from './check-ability.decorator.js';

type RequestWithAuth = Request & { user?: AuthenticatedUser; ability?: AppAbility };

// profile: quyền do AttachmentsService.owned() kiểm; none: fail closed nếu route đòi quyền.
type ResolvedContext =
  | { kind: 'server'; serverId: string }
  | { kind: 'dm'; channelId: string }
  | { kind: 'profile' }
  | { kind: 'none' };

@Injectable()
export class AbilityGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly abilityFactory: AbilityFactory,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithAuth>();
    const required = this.reflector.getAllAndOverride<[Actions, Subjects] | undefined>(
      CHECK_ABILITY_KEY,
      [context.getHandler(), context.getClass()],
    );

    const resolved = await this.resolveContext(request);
    if (resolved.kind === 'none') {
      // Fail closed: route đòi quyền mà không xác định được bối cảnh thì từ chối.
      if (required) {
        throw new ForbiddenException('Insufficient permissions for this action');
      }
      return true;
    }
    if (!request.user) {
      throw new UnauthorizedException('Missing access token');
    }
    if (resolved.kind === 'profile') {
      // Attachment hồ sơ không thuộc server: quyền do AttachmentsService.owned() kiểm.
      return true;
    }

    if (resolved.kind === 'dm') {
      await this.assertDmParticipant(resolved.channelId, request);
    } else {
      request.ability = await this.abilityFactory.createForUser(
        resolved.serverId,
        request.user.userId,
      );
    }

    if (request.ability && required && !request.ability.can(required[0], required[1])) {
      throw new ForbiddenException('Insufficient permissions for this action');
    }
    return true;
  }

  // Không phải participant → 404 che tồn tại DM.
  private async assertDmParticipant(channelId: string, request: RequestWithAuth): Promise<void> {
    const userId = request.user?.userId;
    if (!userId) {
      throw new UnauthorizedException('Missing access token');
    }
    const participant = await this.prisma.dmParticipant.findUnique({
      where: { channelId_userId: { channelId, userId } },
      select: { userId: true },
    });
    if (!participant) {
      throw new NotFoundException('Channel not found');
    }
    request.ability = defineDmAbilityFor(userId);
  }

  private async resolveContext(request: Request): Promise<ResolvedContext> {
    const params = request.params as Record<string, string | undefined>;
    const attachmentId = params.uploadId ?? params.attachmentId;
    if (attachmentId) {
      const attachment = await this.prisma.attachment.findUnique({
        where: { id: attachmentId },
        select: { serverId: true, scope: true, channelId: true },
      });
      if (!attachment) throw new NotFoundException();
      if (attachment.scope !== 'message') return { kind: 'profile' };
      // Attachment DM có serverId NULL: bỏ qua kiểm quyền là lỗ IDOR, phải kiểm participant.
      if (attachment.serverId === null) {
        if (attachment.channelId === null) throw new NotFoundException();
        return { kind: 'dm', channelId: attachment.channelId };
      }
      return { kind: 'server', serverId: attachment.serverId };
    }
    if (params.serverId) {
      return { kind: 'server', serverId: params.serverId };
    }
    if (params.channelId) {
      const channel = await this.prisma.channel.findUnique({
        where: { id: params.channelId },
        select: { id: true, serverId: true, type: true },
      });
      if (!channel) {
        throw new NotFoundException('Channel not found');
      }
      if (channel.type === 'DM') {
        return { kind: 'dm', channelId: channel.id };
      }
      if (channel.serverId === null) throw new NotFoundException('Channel not found');
      return { kind: 'server', serverId: channel.serverId };
    }
    if (params.messageId) {
      const message = await this.prisma.message.findUnique({
        where: { id: params.messageId },
        select: { channel: { select: { id: true, serverId: true, type: true } } },
      });
      if (!message) {
        throw new NotFoundException('Message not found');
      }
      if (message.channel.type === 'DM') {
        return { kind: 'dm', channelId: message.channel.id };
      }
      if (message.channel.serverId === null) throw new NotFoundException('Message not found');
      return { kind: 'server', serverId: message.channel.serverId };
    }
    if (params.roleId) {
      const role = await this.prisma.role.findUnique({
        where: { id: params.roleId },
        select: { serverId: true },
      });
      if (!role) {
        throw new NotFoundException('Role not found');
      }
      return { kind: 'server', serverId: role.serverId };
    }
    if (params.stickerId) {
      // Gói sticker hệ thống (serverId null): bỏ qua kiểm quyền server, service chặn xóa.
      const sticker = await this.prisma.sticker.findUnique({
        where: { id: params.stickerId },
        select: { pack: { select: { serverId: true } } },
      });
      if (!sticker) {
        throw new NotFoundException('Sticker not found');
      }
      return sticker.pack.serverId === null
        ? { kind: 'profile' }
        : { kind: 'server', serverId: sticker.pack.serverId };
    }
    if (params.emojiId) {
      // Emoji đã xóa mềm vẫn trả server để guard chạy; service mới trả 404.
      const emoji = await this.prisma.customEmoji.findUnique({
        where: { id: params.emojiId },
        select: { serverId: true },
      });
      if (!emoji) {
        throw new NotFoundException('Emoji not found');
      }
      return { kind: 'server', serverId: emoji.serverId };
    }
    return { kind: 'none' };
  }
}
