import { Body, Controller, Delete, Get, HttpCode, Param, Put, UseGuards } from '@nestjs/common';
import {
  setNotificationPrefSchema,
  type NotificationPrefDto,
  type NotificationPrefsResponse,
  type SetNotificationPrefInput,
} from '@ping/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { NotificationsService } from './notifications.service.js';

/**
 * TG.12: prefs thông báo của CHÍNH người gọi (/users/me/...). Bối cảnh luôn là người gọi
 * (userId từ JWT, không có id user trên path) nên chỉ cần JwtAuthGuard — không có ability
 * server; quyền trên target không được kiểm vì prefs là dữ liệu user-scoped, vô hại với
 * target (lý do đầy đủ ở NotificationsService.setServerPref).
 *
 * PUT trả 200 với dòng prefs (hình dạng response theo docs/api-conventions.md: sửa = 200),
 * DELETE idempotent 204 (reset về mặc định, gỡ lần nữa vẫn 204).
 */
@Controller('users/me/notification-prefs')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  /** Mọi dòng prefs của người gọi — client fetch một lần khi boot, tính badge tại chỗ. */
  @Get()
  list(@CurrentUser() user: AuthenticatedUser): Promise<NotificationPrefsResponse> {
    return this.notifications.list(user.userId);
  }

  @Put('server/:serverId')
  setServer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('serverId') serverId: string,
    @Body(new ZodValidationPipe(setNotificationPrefSchema)) body: SetNotificationPrefInput,
  ): Promise<NotificationPrefDto> {
    return this.notifications.setServerPref(user.userId, serverId, body);
  }

  @Put('channel/:channelId')
  setChannel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('channelId') channelId: string,
    @Body(new ZodValidationPipe(setNotificationPrefSchema)) body: SetNotificationPrefInput,
  ): Promise<NotificationPrefDto> {
    return this.notifications.setChannelPref(user.userId, channelId, body);
  }

  /** Reset về mặc định — idempotent: gỡ target chưa cấu hình vẫn 204. */
  @Delete('server/:serverId')
  @HttpCode(204)
  async deleteServer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('serverId') serverId: string,
  ): Promise<void> {
    await this.notifications.deleteServerPref(user.userId, serverId);
  }

  /** Như server — idempotent 204. */
  @Delete('channel/:channelId')
  @HttpCode(204)
  async deleteChannel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('channelId') channelId: string,
  ): Promise<void> {
    await this.notifications.deleteChannelPref(user.userId, channelId);
  }
}
