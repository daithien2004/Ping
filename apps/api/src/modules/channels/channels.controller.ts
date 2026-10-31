import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  createChannelSchema,
  markChannelReadSchema,
  moveChannelSchema,
  setTopicSchema,
  updateChannelSchema,
  type CreateChannelInput,
  type MarkChannelReadInput,
  type MoveChannelInput,
  type SetTopicInput,
  type UpdateChannelInput,
} from '@ping/shared';
import { IdempotencyInterceptor } from '../../common/interceptors/idempotency.interceptor.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { AbilityGuard } from '../ability/ability.guard.js';
import { CheckAbility } from '../ability/check-ability.decorator.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ChannelsService } from './channels.service.js';
import { ReadStateService } from './read-state.service.js';

/** @Controller() gốc vì route trải trên hai prefix: /servers/:id/channels và /channels/:id. */
@Controller()
@UseGuards(JwtAuthGuard, AbilityGuard)
export class ChannelsController {
  constructor(
    private readonly channelsService: ChannelsService,
    private readonly readState: ReadStateService,
  ) {}

  @Post('servers/:serverId/channels')
  @CheckAbility(['manage', 'Channel'])
  @UseInterceptors(IdempotencyInterceptor)
  create(
    @Param('serverId') serverId: string,
    @Body(new ZodValidationPipe(createChannelSchema)) body: CreateChannelInput,
  ) {
    return this.channelsService.create(serverId, body.name);
  }

  @Get('servers/:serverId/channels')
  @CheckAbility(['view', 'Channel'])
  list(@Param('serverId') serverId: string) {
    return this.channelsService.list(serverId);
  }

  /**
   * Đánh dấu đã đọc đến `messageId` (T4.2): chỉ thành viên xem được channel; cursor chỉ
   * tiến, không lùi. 204 — các tab khác của cùng user nhận `read.updated`.
   */
  @Put('channels/:channelId/read')
  @CheckAbility(['view', 'Message'])
  @HttpCode(204)
  markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('channelId') channelId: string,
    @Body(new ZodValidationPipe(markChannelReadSchema)) body: MarkChannelReadInput,
  ) {
    return this.readState.markRead(channelId, user.userId, body.messageId);
  }

  /** Số tin/mention chưa đọc của mọi channel trong server (T4.2); đếm có trần 100. */
  @Get('servers/:serverId/unread')
  @CheckAbility(['view', 'Server'])
  unread(@CurrentUser() user: AuthenticatedUser, @Param('serverId') serverId: string) {
    return this.readState.unreadForServer(serverId, user.userId);
  }

  @Patch('channels/:channelId')
  @CheckAbility(['manage', 'Channel'])
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('channelId') channelId: string,
    @Body(new ZodValidationPipe(updateChannelSchema)) body: UpdateChannelInput,
  ) {
    return this.channelsService.update(channelId, user.userId, body);
  }

  @Delete('channels/:channelId')
  @CheckAbility(['manage', 'Channel'])
  remove(@CurrentUser() user: AuthenticatedUser, @Param('channelId') channelId: string) {
    return this.channelsService.remove(channelId, user.userId);
  }

  /**
   * TG.10: di chuyển channel vào category (`categoryId` = id) hoặc ra vùng mặc định (null).
   * `positionKey` do UI tính bằng lexorank; bỏ trống = chèn cuối nhóm đích. 200 kèm DTO mới;
   * room server nhận `channel.reordered` với thứ tự mới của nhóm đích.
   */
  @Put('channels/:channelId/move')
  @CheckAbility(['manage', 'Channel'])
  move(
    @CurrentUser() user: AuthenticatedUser,
    @Param('channelId') channelId: string,
    @Body(new ZodValidationPipe(moveChannelSchema)) body: MoveChannelInput,
  ) {
    return this.channelsService.move(channelId, user.userId, body);
  }

  /** TG.10: đặt/xóa chủ đề hiển thị ở header (chuỗi rỗng = xóa); phát `channel.updated`. */
  @Patch('channels/:channelId/topic')
  @CheckAbility(['manage', 'Channel'])
  setTopic(
    @Param('channelId') channelId: string,
    @Body(new ZodValidationPipe(setTopicSchema)) body: SetTopicInput,
  ) {
    return this.channelsService.setTopic(channelId, body.topic);
  }
}
