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

/**
 * Bối cảnh quyền suy ra từ tham số route:
 * - `server`: bối cảnh server thường — nạp ability theo membership/role.
 * - `dm`: channel DM (TG.9, ADR-0070 mục 8) — quyền theo DmParticipant, không theo server.
 * - `profile`: attachment hồ sơ (avatar/serverIcon) không thuộc server — quyền do
 *   AttachmentsService.owned() kiểm, không nạp ability.
 * - `none`: route không có id bối cảnh — fail closed nếu route đòi quyền.
 */
type ResolvedContext =
  | { kind: 'server'; serverId: string }
  | { kind: 'dm'; channelId: string }
  | { kind: 'profile' }
  | { kind: 'none' };

/**
 * Chặn sớm theo LOẠI (guide 10.2) — luôn chạy sau JwtAuthGuard:
 * 1. Resolve bối cảnh quyền từ route. Route theo channelId/messageId/roleId thì tra DB ra
 *    server tương ứng — moderator server A không bao giờ chạm được channel server B.
 * 2. Channel DM: người gọi phải là DmParticipant, ngược lại 404 che tồn tại (ADR-0070 mục 8).
 * 3. Không phải member của server đó → 403 ngay (AbilityFactory ném).
 * 4. Có @CheckAbility thì check thêm ability.can(action, subject).
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

    const resolved = await this.resolveContext(request);
    if (resolved.kind === 'none') {
      // Fail closed: route đòi quyền mà không xác định được bối cảnh là lỗi cấu hình
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
    if (resolved.kind === 'profile') {
      // TG.7: attachment hồ sơ (avatar/serverIcon) không thuộc server — quyền do
      // AttachmentsService.owned() kiểm (chỉ uploader; serverIcon cần `update Server`).
      return true;
    }

    if (resolved.kind === 'dm') {
      // TG.9: participant hợp lệ nhận ability DM (hai participant ngang hàng, không role).
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

  /**
   * TG.9 (ADR-0070 mục 8): người gọi phải là participant của channel DM, ngược lại 404 CHE
   * TỒN TẠI (pattern messages.service tin-around) — người ngoài không phân biệt được DM có
   * thật hay không. Participant hợp lệ nhận `defineDmAbilityFor` thay cho ability server.
   */
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
      // TG.9 (ADR-0070 mục 8): attachment của tin DM có serverId NULL — trả `null` để bỏ qua
      // kiểm quyền như trước đây là LỖ IDOR tải tệp DM mà ADR chỉ đích danh; kiểm participant.
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
      // Channel server luôn có serverId (chỉ DM mới NULL — ADR-0070); lệch dữ liệu thì 404.
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
      // TG.22: server của sticker suy qua gói; gói hệ thống (serverId null) không thuộc
      // server nào — bỏ qua kiểm quyền theo server, service chặn xóa sticker hệ thống.
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
      // TG.24: emoji tùy chỉnh luôn thuộc một server (không có emoji hệ thống) nên
      // luôn xác định được bối cảnh — emoji đã xóa mềm vẫn trả server để guard chạy,
      // service mới trả 404 (như tin đã soft-delete).
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
