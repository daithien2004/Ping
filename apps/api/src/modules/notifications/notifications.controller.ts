import { Body, Controller, Delete, Get, HttpCode, Param, Put, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  setNotificationPrefSchema,
  type NotificationPrefDto,
  type NotificationPrefsResponse,
  type SetNotificationPrefInput,
} from '@ping/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { RATE_LIMIT_BUCKETS } from '../../common/rate-limit-buckets.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { NotificationsService } from './notifications.service.js';

@Controller('users/me/notification-prefs')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @Throttle({ default: RATE_LIMIT_BUCKETS.readLight })
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

  @Delete('server/:serverId')
  @HttpCode(204)
  async deleteServer(
    @CurrentUser() user: AuthenticatedUser,
    @Param('serverId') serverId: string,
  ): Promise<void> {
    await this.notifications.deleteServerPref(user.userId, serverId);
  }

  @Delete('channel/:channelId')
  @HttpCode(204)
  async deleteChannel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('channelId') channelId: string,
  ): Promise<void> {
    await this.notifications.deleteChannelPref(user.userId, channelId);
  }
}
