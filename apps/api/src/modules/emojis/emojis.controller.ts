import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  createCustomEmojiSchema,
  type CreateCustomEmojiInput,
  type CustomEmojiDto,
  type CustomEmojiListResponse,
} from '@ping/shared';
import type { AppAbility } from '@ping/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { AbilityGuard } from '../ability/ability.guard.js';
import { CheckAbility, CurrentAbility } from '../ability/check-ability.decorator.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { EmojisService } from './emojis.service.js';

/**
 * Emoji tùy chỉnh theo server (TG.24, ADR-0068). Xem danh sách: mọi member (`view Sticker`);
 * tạo cần `create Sticker` (MANAGE_EXPRESSIONS — cùng nhóm biểu cảm với sticker nên tái
 * dùng subject 'Sticker', không thêm subject CASL); xóa cần `delete Sticker` — guard tra
 * server qua chính emoji (nhánh `:emojiId` của AbilityGuard), service ghi audit `EMOJI_DELETE`.
 */
@Controller()
@UseGuards(JwtAuthGuard, AbilityGuard)
export class EmojisController {
  constructor(private readonly emojisService: EmojisService) {}

  @Post('servers/:serverId/emojis')
  @CheckAbility(['create', 'Sticker'])
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('serverId') serverId: string,
    @Body(new ZodValidationPipe(createCustomEmojiSchema)) body: CreateCustomEmojiInput,
  ): Promise<CustomEmojiDto> {
    return this.emojisService.create(serverId, user.userId, body);
  }

  @Get('servers/:serverId/emojis')
  @CheckAbility(['view', 'Sticker'])
  list(@Param('serverId') serverId: string): Promise<CustomEmojiListResponse> {
    return this.emojisService.list(serverId);
  }

  @Delete('emojis/:emojiId')
  @CheckAbility(['delete', 'Sticker'])
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentAbility() _ability: AppAbility,
    @Param('emojiId') emojiId: string,
  ): Promise<{ id: string }> {
    return this.emojisService.remove(emojiId, user.userId);
  }
}
