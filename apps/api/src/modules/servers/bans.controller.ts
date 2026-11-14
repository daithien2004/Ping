import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  createBanSchema,
  listBansQuerySchema,
  type CreateBanInput,
  type ListBansQuery,
} from '@ping/shared';
import { IdempotencyInterceptor } from '../../common/interceptors/idempotency.interceptor.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { RATE_LIMIT_BUCKETS } from '../../common/rate-limit-buckets.js';
import { AbilityGuard } from '../ability/ability.guard.js';
import { CheckAbility } from '../ability/check-ability.decorator.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { BansService } from './bans.service.js';

// Guard: `KICK_MEMBERS` (không thêm bit mới); thứ bậc theo đối tượng ở BansService.
@Controller('servers/:serverId/bans')
@Throttle({ default: RATE_LIMIT_BUCKETS.writeStructure })
@UseGuards(JwtAuthGuard, AbilityGuard)
export class BansController {
  constructor(private readonly bansService: BansService) {}

  @Post()
  @HttpCode(201)
  @CheckAbility(['create', 'ServerBan'])
  @UseInterceptors(IdempotencyInterceptor)
  ban(
    @CurrentUser() user: AuthenticatedUser,
    @Param('serverId') serverId: string,
    @Body(new ZodValidationPipe(createBanSchema)) body: CreateBanInput,
  ) {
    return this.bansService.ban(serverId, user.userId, body);
  }

  @Delete(':userId')
  @HttpCode(204)
  @CheckAbility(['delete', 'ServerBan'])
  unban(
    @CurrentUser() user: AuthenticatedUser,
    @Param('serverId') serverId: string,
    @Param('userId') userId: string,
  ) {
    return this.bansService.unban(serverId, user.userId, userId);
  }

  @Get()
  @Throttle({ default: RATE_LIMIT_BUCKETS.readLight })
  @CheckAbility(['view', 'ServerBan'])
  list(
    @Param('serverId') serverId: string,
    @Query(new ZodValidationPipe(listBansQuerySchema)) query: ListBansQuery,
  ) {
    return this.bansService.list(serverId, query);
  }
}
