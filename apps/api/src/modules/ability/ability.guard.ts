import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Actions, AppAbility, Subjects } from '@ping/shared';
import type { Request } from 'express';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { AuthenticatedUser } from '../auth/current-user.decorator.js';
import { AbilityFactory } from './ability.factory.js';
import { CHECK_ABILITY_KEY } from './check-ability.decorator.js';

type RequestWithAuth = Request & { user?: AuthenticatedUser; ability?: AppAbility };

/**
 * Chặn sớm theo LOẠI (guide 10.2) — luôn chạy sau JwtAuthGuard:
 * 1. Resolve serverId từ route. Route theo channelId/messageId/roleId thì tra DB ra
 *    server tương ứng — moderator server A không bao giờ chạm được channel server B.
 * 2. Không phải member của server đó → 403 ngay (AbilityFactory ném).
 * 3. Có @CheckAbility thì check thêm ability.can(action, subject).
 * Route không có id nào ở trên (vd. POST /servers) không có bối cảnh server:
 * cho qua nếu route không đòi quyền, từ chối nếu có @CheckAbility (fail closed).
 */
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

    const serverId = await this.resolveServerId(request);
    if (serverId === undefined) {
      // Fail closed: route đòi quyền mà không xác định được server là lỗi cấu hình
      // route — từ chối thay vì cho qua (lỗ IDOR /roles/:roleId từng nằm ở đây).
      if (required) {
        throw new ForbiddenException('Insufficient permissions for this action');
      }
      return true;
    }
    if (!request.user) {
      // @UseGuards(JwtAuthGuard, AbilityGuard) — thứ tự mảng = thứ tự thực thi.
      throw new UnauthorizedException('Missing access token');
    }

    const ability = await this.abilityFactory.createForUser(serverId, request.user.userId);
    request.ability = ability;

    if (required && !ability.can(required[0], required[1])) {
      throw new ForbiddenException('Insufficient permissions for this action');
    }
    return true;
  }

  private async resolveServerId(request: Request): Promise<string | undefined> {
    const params = request.params as Record<string, string | undefined>;
    const attachmentId = params.uploadId ?? params.attachmentId;
    if (attachmentId) {
      const attachment = await this.prisma.attachment.findUnique({
        where: { id: attachmentId },
        select: { serverId: true },
      });
      if (!attachment) throw new NotFoundException();
      return attachment.serverId;
    }
    if (params.serverId) {
      return params.serverId;
    }
    if (params.channelId) {
      const channel = await this.prisma.channel.findUnique({
        where: { id: params.channelId },
        select: { serverId: true },
      });
      if (!channel) {
        throw new NotFoundException('Channel not found');
      }
      return channel.serverId;
    }
    if (params.messageId) {
      const message = await this.prisma.message.findUnique({
        where: { id: params.messageId },
        select: { channel: { select: { serverId: true } } },
      });
      if (!message) {
        throw new NotFoundException('Message not found');
      }
      return message.channel.serverId;
    }
    if (params.roleId) {
      const role = await this.prisma.role.findUnique({
        where: { id: params.roleId },
        select: { serverId: true },
      });
      if (!role) {
        throw new NotFoundException('Role not found');
      }
      return role.serverId;
    }
    return undefined;
  }
}
