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

  /**
   * Tìm kiếm tin nhắn trong server (T4.6, ADR-0045): FTS + trigram, lọc channel/author/thời
   * gian, cursor `before`. Guard `view Message` (T6.5) — thành viên thiếu VIEW_CHANNEL không
   * được đọc nội dung tin qua search; where luôn ràng buộc serverId.
   */
  @Get('servers/:serverId/search')
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
  @CheckAbility(['view', 'Message'])
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Param('channelId') channelId: string,
    @Query(new ZodValidationPipe(listMessagesQuerySchema)) query: ListMessagesQuery,
  ) {
    return this.messagesService.list(channelId, query, user.userId);
  }

  @Post('channels/:channelId/messages')
  @CheckAbility(['create', 'Message'])
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('channelId') channelId: string,
    @Body(new ZodValidationPipe(createMessageSchema)) body: CreateMessageInput,
  ) {
    return this.messagesService.create(channelId, user.userId, body);
  }

  /**
   * PATCH/DELETE không có @CheckAbility loại: rule update/delete Message là
   * ĐIỀU KIỆN (authorId = me) — phải để service kiểm tra với đối tượng thật
   * (tier 2). Guard vẫn đảm bảo người gọi là member của server chứa tin.
   */
  @Patch('messages/:messageId')
  update(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentAbility() ability: AppAbility,
    @Param('messageId') messageId: string,
    @Body(new ZodValidationPipe(updateMessageSchema)) body: UpdateMessageInput,
  ) {
    return this.messagesService.update(messageId, ability, body.content, user.userId);
  }

  @Delete('messages/:messageId')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentAbility() ability: AppAbility,
    @Param('messageId') messageId: string,
  ) {
    return this.messagesService.remove(messageId, user.userId, ability);
  }

  /**
   * TG.3 (ADR-0066): ghim tin trong channel. `PUT`/`DELETE` idempotent, trả trạng thái sau thao
   * tác; danh sách ghim có trần `Limits.PINS_PER_CHANNEL` nên trả mảng thẳng, không phân trang.
   * Quyền: `MANAGE_MESSAGES` + `VIEW_CHANNEL` (subject `Pin` trong `defineAbilityFor`).
   */
  @Get('channels/:channelId/pins')
  @CheckAbility(['view', 'Message'])
  pins(@CurrentUser() user: AuthenticatedUser, @Param('channelId') channelId: string) {
    return this.messagesService.listPins(channelId, user.userId);
  }

  @Put('messages/:messageId/pin')
  @CheckAbility(['create', 'Pin'])
  pin(@CurrentUser() user: AuthenticatedUser, @Param('messageId') messageId: string) {
    return this.messagesService.pin(messageId, user.userId);
  }

  @Delete('messages/:messageId/pin')
  @CheckAbility(['delete', 'Pin'])
  unpin(@CurrentUser() user: AuthenticatedUser, @Param('messageId') messageId: string) {
    return this.messagesService.unpin(messageId, user.userId);
  }

  /**
   * TG.2 (ADR-0064): cảm xúc. `PUT`/`DELETE` idempotent — thả/gỡ lại cùng emoji không đổi
   * trạng thái và không phát event lần hai. Emoji đi qua allowlist của `@ping/shared` trong
   * service (param `:emoji` đã được Express giải mã URL).
   */
  @Get('messages/:messageId/reactions/:emoji')
  @CheckAbility(['view', 'Message'])
  reactionUsers(
    @Param('messageId') messageId: string,
    @Param('emoji') emoji: string,
    @Query(new ZodValidationPipe(reactionUsersQuerySchema)) query: ReactionUsersQuery,
  ) {
    return this.messagesService.reactionUsers(messageId, emoji, query);
  }

  @Put('messages/:messageId/reactions/:emoji')
  @CheckAbility(['create', 'Reaction'])
  addReaction(
    @CurrentUser() user: AuthenticatedUser,
    @Param('messageId') messageId: string,
    @Param('emoji') emoji: string,
  ) {
    return this.messagesService.addReaction(messageId, user.userId, emoji);
  }

  @Delete('messages/:messageId/reactions/:emoji')
  @CheckAbility(['create', 'Reaction'])
  removeReaction(
    @CurrentUser() user: AuthenticatedUser,
    @Param('messageId') messageId: string,
    @Param('emoji') emoji: string,
  ) {
    return this.messagesService.removeReaction(messageId, user.userId, emoji);
  }
}
