import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import {
  createDmSchema,
  type BlockedUsersResponse,
  type CreateDmInput,
  type DmListResponse,
  type DmSummary,
} from '@ping/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { DmsService } from './dms.service.js';

/**
 * TG.9 (ADR-0070): DM 1:1 + chặn người dùng. Toàn bộ route yêu cầu đăng nhập; bối cảnh là
 * CHÍNH người gọi (không có bối cảnh server) nên chỉ cần JwtAuthGuard — quyền chi tiết do
 * service và AbilityGuard (channel DM qua participant) kiểm.
 *
 * Block đặt cùng module với DM vì hai mức chặn của UserBlock đều thuộc TG.9: chặn tạo DM
 * mới (đây) và chặn tin mới trong DM có sẵn (MessagesService).
 */
@Controller()
@UseGuards(JwtAuthGuard)
export class DmsController {
  constructor(private readonly dms: DmsService) {}

  /**
   * Get-or-create idempotent (ADR-0070 mục 2): cặp đã có trả 200 với channel cũ — vì vậy
   * luôn @HttpCode(200), kể cả khi vừa tạo (không 201) để client không phân biệt hai nhánh.
   */
  @Post('dms')
  @HttpCode(200)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createDmSchema)) body: CreateDmInput,
  ): Promise<DmSummary> {
    return this.dms.create(user.userId, body.userId);
  }

  /** Danh sách hội thoại DM của chính người gọi (sidebar DM — ADR-0070 mục 7). */
  @Get('dms')
  list(@CurrentUser() user: AuthenticatedUser): Promise<DmListResponse> {
    return this.dms.list(user.userId);
  }

  /** Chặn người dùng — idempotent, 204 không body (không trả hàng UserBlock ra ngoài). */
  @Post('users/:userId/block')
  @HttpCode(204)
  async block(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') targetId: string,
  ): Promise<void> {
    await this.dms.block(user.userId, targetId);
  }

  /** Bỏ chặn — idempotent: gỡ người chưa chặn vẫn 204. */
  @Delete('users/:userId/block')
  @HttpCode(204)
  async unblock(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') targetId: string,
  ): Promise<void> {
    await this.dms.unblock(user.userId, targetId);
  }

  /**
   * TG.13: danh sách người TÔI đã chặn (liệt kê UserBlock của TG.9), mới nhất trước. Route
   * không có id trong path — bối cảnh là chính người gọi (userId từ JWT), cùng nhánh `me`
   * với cài đặt; bỏ chặn tái dùng DELETE /users/:userId/block ở trên.
   */
  @Get('users/me/blocks')
  listBlocks(@CurrentUser() user: AuthenticatedUser): Promise<BlockedUsersResponse> {
    return this.dms.listBlocks(user.userId);
  }
}
