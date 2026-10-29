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
import {
  createBanSchema,
  listBansQuerySchema,
  type CreateBanInput,
  type ListBansQuery,
} from '@ping/shared';
import { IdempotencyInterceptor } from '../../common/interceptors/idempotency.interceptor.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { AbilityGuard } from '../ability/ability.guard.js';
import { CheckAbility } from '../ability/check-ability.decorator.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { BansService } from './bans.service.js';

/**
 * Ban/unban thành viên (TG.11). Guard: cần `create/delete/view ServerBan` — bit
 * KICK_MEMBERS (lý do không thêm bit mới ở BansService và defineAbilityFor).
 * Thứ bậc theo đối tượng (không ban owner/người mạnh hơn, không tự ban) ở BansService.
 */
@Controller('servers/:serverId/bans')
@UseGuards(JwtAuthGuard, AbilityGuard)
export class BansController {
  constructor(private readonly bansService: BansService) {}

  /**
   * Ban: 201 kèm ServerBanDto. Idempotency-Key (quy tắc 12): client retry an toàn —
   * trùng key nhận lại đúng response lần đầu thay vì đụng unique constraint.
   */
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

  /** Unban: 204; chưa có lệnh ban cho userId này → 404 (xem lý do ở BansService.unban). */
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

  /** Danh sách ban, mới nhất trước — công cụ quản lý của người mang KICK_MEMBERS. */
  @Get()
  @CheckAbility(['view', 'ServerBan'])
  list(
    @Param('serverId') serverId: string,
    @Query(new ZodValidationPipe(listBansQuerySchema)) query: ListBansQuery,
  ) {
    return this.bansService.list(serverId, query);
  }
}
