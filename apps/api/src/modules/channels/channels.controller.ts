import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { createChannelSchema, type CreateChannelInput } from '@ping/shared';
import { IdempotencyInterceptor } from '../../common/interceptors/idempotency.interceptor.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { AbilityGuard } from '../ability/ability.guard.js';
import { CheckAbility } from '../ability/check-ability.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ChannelsService } from './channels.service.js';
import { updateChannelSchema, type UpdateChannelInput } from './schemas.js';

/** @Controller() gốc vì route trải trên hai prefix: /servers/:id/channels và /channels/:id. */
@Controller()
@UseGuards(JwtAuthGuard, AbilityGuard)
export class ChannelsController {
  constructor(private readonly channelsService: ChannelsService) {}

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

  @Patch('channels/:channelId')
  @CheckAbility(['manage', 'Channel'])
  update(
    @Param('channelId') channelId: string,
    @Body(new ZodValidationPipe(updateChannelSchema)) body: UpdateChannelInput,
  ) {
    return this.channelsService.update(channelId, body);
  }

  @Delete('channels/:channelId')
  @CheckAbility(['manage', 'Channel'])
  remove(@Param('channelId') channelId: string) {
    return this.channelsService.remove(channelId);
  }
}
