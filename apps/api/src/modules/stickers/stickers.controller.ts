import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import {
  createStickerSchema,
  type CreateStickerInput,
  type StickerDto,
  type StickerListResponse,
} from '@ping/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { AbilityGuard } from '../ability/ability.guard.js';
import { CheckAbility, CurrentAbility } from '../ability/check-ability.decorator.js';
import type { AppAbility } from '@ping/shared';
import { CurrentUser, type AuthenticatedUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { StickersService } from './stickers.service.js';

/**
 * Sticker của server (TG.22, ADR-0067). Xem danh sách: mọi member (`view Sticker`);
 * tạo cần `create Sticker` (MANAGE_EXPRESSIONS); xóa cần `delete Sticker` — guard tra
 * server qua chính sticker (nhánh `:stickerId` của AbilityGuard), service chặn thêm
 * xóa sticker gói hệ thống và ghi audit.
 */
@Controller()
@UseGuards(JwtAuthGuard, AbilityGuard)
export class StickersController {
  constructor(private readonly stickersService: StickersService) {}

  @Post('servers/:serverId/stickers')
  @CheckAbility(['create', 'Sticker'])
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('serverId') serverId: string,
    @Body(new ZodValidationPipe(createStickerSchema)) body: CreateStickerInput,
  ): Promise<StickerDto> {
    return this.stickersService.create(serverId, user.userId, body);
  }

  @Get('servers/:serverId/stickers')
  @CheckAbility(['view', 'Sticker'])
  list(@Param('serverId') serverId: string): Promise<StickerListResponse> {
    return this.stickersService.list(serverId);
  }

  @Delete('stickers/:stickerId')
  @CheckAbility(['delete', 'Sticker'])
  remove(
    @CurrentUser() user: AuthenticatedUser,
    @CurrentAbility() _ability: AppAbility,
    @Param('stickerId') stickerId: string,
  ): Promise<{ id: string }> {
    return this.stickersService.remove(stickerId, user.userId);
  }
}
