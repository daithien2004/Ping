import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  createDmSchema,
  type BlockedUsersResponse,
  type CreateDmInput,
  type DmListResponse,
  type DmSummary,
} from '@ping/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { RATE_LIMIT_BUCKETS } from '../../common/rate-limit-buckets.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { DmsService } from './dms.service.js';

@Controller()
@UseGuards(JwtAuthGuard)
export class DmsController {
  constructor(private readonly dms: DmsService) {}

  // Luôn @HttpCode(200) kể cả khi vừa tạo, để client không phân biệt hai nhánh.
  @Post('dms')
  @HttpCode(200)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createDmSchema)) body: CreateDmInput,
  ): Promise<DmSummary> {
    return this.dms.create(user.userId, body.userId);
  }

  @Get('dms')
  @Throttle({ default: RATE_LIMIT_BUCKETS.readLight })
  list(@CurrentUser() user: AuthenticatedUser): Promise<DmListResponse> {
    return this.dms.list(user.userId);
  }

  @Post('users/:userId/block')
  @HttpCode(204)
  async block(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') targetId: string,
  ): Promise<void> {
    await this.dms.block(user.userId, targetId);
  }

  @Delete('users/:userId/block')
  @HttpCode(204)
  async unblock(
    @CurrentUser() user: AuthenticatedUser,
    @Param('userId') targetId: string,
  ): Promise<void> {
    await this.dms.unblock(user.userId, targetId);
  }

  @Get('users/me/blocks')
  @Throttle({ default: RATE_LIMIT_BUCKETS.readLight })
  listBlocks(@CurrentUser() user: AuthenticatedUser): Promise<BlockedUsersResponse> {
    return this.dms.listBlocks(user.userId);
  }
}
