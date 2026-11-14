import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  createMessageSchema,
  reactionUsersQuerySchema,
  updateMessageSchema,
  type AppAbility,
  type CreateMessageInput,
  type ReactionUsersQuery,
  type UpdateMessageInput,
} from '@ping/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { RATE_LIMIT_BUCKETS } from '../../common/rate-limit-buckets.js';
import { AbilityGuard } from '../ability/ability.guard.js';
import { CheckAbility, CurrentAbility } from '../ability/check-ability.decorator.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { MessagesService } from './messages.service.js';
import { listMessagesQuerySchema, type ListMessagesQuery } from './schemas.js';
import { searchQuerySchema, type SearchQuery } from '@ping/shared';
import { SearchRateLimiter } from './search-rate-limiter.js';
import { SearchService } from './search.service.js';

@Controller()
@UseGuards(JwtAuthGuard, AbilityGuard)
export class MessagesController {
  constructor(
    private readonly messagesService: MessagesService,
    private readonly searchService: SearchService,
    private readonly searchRateLimiter: SearchRateLimiter,
  ) {}

  // Guard `view Message`: thành viên thiếu VIEW_CHANNEL không được đọc tin qua search; where luôn ràng buộc serverId.
  @Get('servers/:serverId/search')
  @Throttle({ default: RATE_LIMIT_BUCKETS.search })
  @CheckAbility(['view', 'Message'])
  async search(
    @CurrentUser() user: AuthenticatedUser,
    @Param('serverId') serverId: string,
    @Query(new ZodValidationPipe(searchQuerySchema)) query: SearchQuery,
  ) {
    await this.searchRateLimiter.consume(user.userId);
    return this.searchService.search(serverId, query);
  }

  @Get('channels/:channelId/messages')
  @Throttle({ default: RATE_LIMIT_BUCKETS.history })
  @CheckAbility(['view', 'Message'])
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('channelId') channelId: string,
    @Query(new ZodValidationPipe(listMessagesQuerySchema)) query: ListMessagesQuery,
  ) {
    return this.messagesService.list(channelId, query, user.userId);
  }

  @Post('channels/:channelId/messages')
  @Throttle({ default: RATE_LIMIT_BUCKETS.writeMessage })
  @CheckAbility(['create', 'Message'])
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('channelId') channelId: string,
    @Body(new ZodValidationPipe(createMessageSchema)) body: CreateMessageInput,
  ) {
    return this.messagesService.create(channelId, user.userId, body);
  }

  // PATCH/DELETE không có @CheckAbility loại: rule update/delete Message có ĐIỀU KIỆN (authorId = me) nên service kiểm với đối tượng thật.
  @Patch('messages/:messageId')
  @Throttle({ default: RATE_LIMIT_BUCKETS.writeMessage })
  update(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentAbility() ability: AppAbility,
    @Param('messageId') messageId: string,
    @Body(new ZodValidationPipe(updateMessageSchema)) body: UpdateMessageInput,
  ) {
    return this.messagesService.update(messageId, ability, body.content, user.userId);
  }

  @Delete('messages/:messageId')
  @Throttle({ default: RATE_LIMIT_BUCKETS.writeMessage })
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentAbility() ability: AppAbility,
    @Param('messageId') messageId: string,
  ) {
    return this.messagesService.remove(messageId, user.userId, ability);
  }

  @Get('channels/:channelId/pins')
  @Throttle({ default: RATE_LIMIT_BUCKETS.history })
  @CheckAbility(['view', 'Message'])
  pins(@CurrentUser() user: AuthenticatedUser, @Param('channelId') channelId: string) {
    return this.messagesService.listPins(channelId, user.userId);
  }

  @Put('messages/:messageId/pin')
  @Throttle({ default: RATE_LIMIT_BUCKETS.writeMessage })
  @CheckAbility(['create', 'Pin'])
  pin(@CurrentUser() user: AuthenticatedUser, @Param('messageId') messageId: string) {
    return this.messagesService.pin(messageId, user.userId);
  }

  @Delete('messages/:messageId/pin')
  @Throttle({ default: RATE_LIMIT_BUCKETS.writeMessage })
  @CheckAbility(['delete', 'Pin'])
  unpin(@CurrentUser() user: AuthenticatedUser, @Param('messageId') messageId: string) {
    return this.messagesService.unpin(messageId, user.userId);
  }

  @Get('messages/:messageId/reactions/:emoji')
  @Throttle({ default: RATE_LIMIT_BUCKETS.history })
  @CheckAbility(['view', 'Message'])
  reactionUsers(
    @Param('messageId') messageId: string,
    @Param('emoji') emoji: string,
    @Query(new ZodValidationPipe(reactionUsersQuerySchema)) query: ReactionUsersQuery,
  ) {
    return this.messagesService.reactionUsers(messageId, emoji, query);
  }

  @Put('messages/:messageId/reactions/:emoji')
  @Throttle({ default: RATE_LIMIT_BUCKETS.writeMessage })
  @CheckAbility(['create', 'Reaction'])
  addReaction(
    @CurrentUser() user: AuthenticatedUser,
    @Param('messageId') messageId: string,
    @Param('emoji') emoji: string,
  ) {
    return this.messagesService.addReaction(messageId, user.userId, emoji);
  }

  @Delete('messages/:messageId/reactions/:emoji')
  @Throttle({ default: RATE_LIMIT_BUCKETS.writeMessage })
  @CheckAbility(['create', 'Reaction'])
  removeReaction(
    @CurrentUser() user: AuthenticatedUser,
    @Param('messageId') messageId: string,
    @Param('emoji') emoji: string,
  ) {
    return this.messagesService.removeReaction(messageId, user.userId, emoji);
  }
}
