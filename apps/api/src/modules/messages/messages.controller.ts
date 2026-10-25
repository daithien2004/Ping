import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  createMessageSchema,
  updateMessageSchema,
  type AppAbility,
  type CreateMessageInput,
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
import { SearchService } from './search.service.js';

@Controller()
@UseGuards(JwtAuthGuard, AbilityGuard)
export class MessagesController {
  constructor(
    private readonly messagesService: MessagesService,
    private readonly searchService: SearchService,
  ) {}

  /**
   * Tìm kiếm tin nhắn trong server (T4.6, ADR-0045): FTS + trigram, lọc channel/author/thời
   * gian, cursor `before`. Guard `view Server` — chỉ thành viên; where luôn ràng buộc serverId.
   */
  @Get('servers/:serverId/search')
  @CheckAbility(['view', 'Server'])
  search(
    @Param('serverId') serverId: string,
    @Query(new ZodValidationPipe(searchQuerySchema)) query: SearchQuery,
  ) {
    return this.searchService.search(serverId, query);
  }

  @Get('channels/:channelId/messages')
  @CheckAbility(['view', 'Message'])
  list(
    @Param('channelId') channelId: string,
    @Query(new ZodValidationPipe(listMessagesQuerySchema)) query: ListMessagesQuery,
  ) {
    return this.messagesService.list(channelId, query);
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
    @CurrentAbility() ability: AppAbility,
    @Param('messageId') messageId: string,
    @Body(new ZodValidationPipe(updateMessageSchema)) body: UpdateMessageInput,
  ) {
    return this.messagesService.update(messageId, ability, body.content);
  }

  @Delete('messages/:messageId')
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentAbility() ability: AppAbility,
    @Param('messageId') messageId: string,
  ) {
    return this.messagesService.remove(messageId, user.userId, ability);
  }
}
