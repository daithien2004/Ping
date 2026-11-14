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
import { Throttle } from '@nestjs/throttler';
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
import { RATE_LIMIT_BUCKETS } from '../../common/rate-limit-buckets.js';
import { AbilityGuard } from '../ability/ability.guard.js';
import { CheckAbility } from '../ability/check-ability.decorator.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ChannelsService } from './channels.service.js';
import { ReadStateService } from './read-state.service.js';

// @Controller() gốc: route trải trên /servers/:id/channels và /channels/:id.
@Controller()
@UseGuards(JwtAuthGuard, AbilityGuard)
export class ChannelsController {
  constructor(
    private readonly channelsService: ChannelsService,
    private readonly readState: ReadStateService,
  ) {}

  @Post('servers/:serverId/channels')
  @Throttle({ default: RATE_LIMIT_BUCKETS.writeStructure })
  @CheckAbility(['manage', 'Channel'])
  @UseInterceptors(IdempotencyInterceptor)
  create(
    @Param('serverId') serverId: string,
    @Body(new ZodValidationPipe(createChannelSchema)) body: CreateChannelInput,
  ) {
    return this.channelsService.create(serverId, body.name);
  }

  @Get('servers/:serverId/channels')
  @Throttle({ default: RATE_LIMIT_BUCKETS.readLight })
  @CheckAbility(['view', 'Channel'])
  list(@Param('serverId') serverId: string) {
    return this.channelsService.list(serverId);
  }

  @Put('channels/:channelId/read')
  @Throttle({ default: RATE_LIMIT_BUCKETS.history })
  @CheckAbility(['view', 'Message'])
  @HttpCode(204)
  markRead(
    @CurrentUser() user: AuthenticatedUser,
    @Param('channelId') channelId: string,
    @Body(new ZodValidationPipe(markChannelReadSchema)) body: MarkChannelReadInput,
  ) {
    return this.readState.markRead(channelId, user.userId, body.messageId);
  }

  @Get('servers/:serverId/unread')
  @Throttle({ default: RATE_LIMIT_BUCKETS.readLight })
  @CheckAbility(['view', 'Server'])
  unread(@CurrentUser() user: AuthenticatedUser, @Param('serverId') serverId: string) {
    return this.readState.unreadForServer(serverId, user.userId);
  }

  @Patch('channels/:channelId')
  @Throttle({ default: RATE_LIMIT_BUCKETS.writeStructure })
  @CheckAbility(['manage', 'Channel'])
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('channelId') channelId: string,
    @Body(new ZodValidationPipe(updateChannelSchema)) body: UpdateChannelInput,
  ) {
    return this.channelsService.update(channelId, user.userId, body);
  }

  @Delete('channels/:channelId')
  @Throttle({ default: RATE_LIMIT_BUCKETS.writeStructure })
  @CheckAbility(['manage', 'Channel'])
  remove(@CurrentUser() user: AuthenticatedUser, @Param('channelId') channelId: string) {
    return this.channelsService.remove(channelId, user.userId);
  }

  @Put('channels/:channelId/move')
  @Throttle({ default: RATE_LIMIT_BUCKETS.writeStructure })
  @CheckAbility(['manage', 'Channel'])
  move(
    @CurrentUser() user: AuthenticatedUser,
    @Param('channelId') channelId: string,
    @Body(new ZodValidationPipe(moveChannelSchema)) body: MoveChannelInput,
  ) {
    return this.channelsService.move(channelId, user.userId, body);
  }

  @Patch('channels/:channelId/topic')
  @Throttle({ default: RATE_LIMIT_BUCKETS.writeStructure })
  @CheckAbility(['manage', 'Channel'])
  setTopic(
    @Param('channelId') channelId: string,
    @Body(new ZodValidationPipe(setTopicSchema)) body: SetTopicInput,
  ) {
    return this.channelsService.setTopic(channelId, body.topic);
  }
}
