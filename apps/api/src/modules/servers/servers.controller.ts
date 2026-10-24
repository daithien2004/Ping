import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  createServerSchema,
  joinServerSchema,
  listMembersQuerySchema,
  regenerateInviteSchema,
  updateServerSchema,
  type CreateServerInput,
  type JoinServerInput,
  type ListMembersQuery,
  type RegenerateInviteInput,
  type UpdateServerInput,
} from '@ping/shared';
import { IdempotencyInterceptor } from '../../common/interceptors/idempotency.interceptor.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { AbilityGuard } from '../ability/ability.guard.js';
import { CheckAbility } from '../ability/check-ability.decorator.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ServersService } from './servers.service.js';

@Controller('servers')
@UseGuards(JwtAuthGuard, AbilityGuard)
export class ServersController {
  constructor(private readonly serversService: ServersService) {}

  /** Chỉ cần đăng nhập — chưa có bối cảnh server nên không có @CheckAbility. */
  @Post()
  @UseInterceptors(IdempotencyInterceptor)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createServerSchema)) body: CreateServerInput,
  ) {
    return this.serversService.create(user.userId, body.name);
  }

  @Get()
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.serversService.listForUser(user.userId);
  }

  @Post('join')
  join(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(joinServerSchema)) body: JoinServerInput,
  ) {
    return this.serversService.join(user.userId, body.inviteCode);
  }

  @Get(':serverId')
  @CheckAbility(['view', 'Server'])
  detail(@Param('serverId') serverId: string) {
    return this.serversService.detail(serverId);
  }

  /** Đổi tên server: cần `update Server` (MANAGE_SERVER); service ghi audit trong transaction. */
  @Patch(':serverId')
  @CheckAbility(['update', 'Server'])
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('serverId') serverId: string,
    @Body(new ZodValidationPipe(updateServerSchema)) body: UpdateServerInput,
  ) {
    return this.serversService.update(serverId, user.userId, body.name);
  }

  /**
   * Tạo mã mời mới, vô hiệu mã cũ (T3.6): cần `update Server` (MANAGE_SERVER) — cùng
   * mức quyền với đổi tên; service thu hồi/cấp mã + ghi audit trong một transaction.
   */
  @Post(':serverId/invite/regenerate')
  @CheckAbility(['update', 'Server'])
  @UseInterceptors(IdempotencyInterceptor)
  regenerateInvite(
    @CurrentUser() user: AuthenticatedUser,
    @Param('serverId') serverId: string,
    @Body(new ZodValidationPipe(regenerateInviteSchema)) body: RegenerateInviteInput,
  ) {
    return this.serversService.regenerate(serverId, user.userId, body);
  }

  /** Quyền hiệu lực của chính người gọi: frontend dựng CASL ability từ đây để ẩn/hiện nút. */
  @Get(':serverId/me/permissions')
  @CheckAbility(['view', 'Server'])
  myPermissions(@CurrentUser() user: AuthenticatedUser, @Param('serverId') serverId: string) {
    return this.serversService.myPermissions(serverId, user.userId);
  }

  @Get(':serverId/members')
  @CheckAbility(['view', 'Member'])
  members(
    @Param('serverId') serverId: string,
    @Query(new ZodValidationPipe(listMembersQuerySchema)) query: ListMembersQuery,
  ) {
    return this.serversService.members(serverId, query);
  }

  @Post(':serverId/leave')
  @HttpCode(204)
  leave(@CurrentUser() user: AuthenticatedUser, @Param('serverId') serverId: string) {
    return this.serversService.leave(serverId, user.userId);
  }

  /** Kick member. Guard: cần `delete Member` (KICK_MEMBERS); service: so quyền với người bị kick. */
  @Delete(':serverId/members/:memberId')
  @HttpCode(204)
  @CheckAbility(['delete', 'Member'])
  kick(
    @CurrentUser() user: AuthenticatedUser,
    @Param('serverId') serverId: string,
    @Param('memberId') memberId: string,
  ) {
    return this.serversService.kick(serverId, user.userId, memberId);
  }

  /** Không @CheckAbility: chỉ owner được xóa (service tier-2 kiểm tra). */
  @Delete(':serverId')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('serverId') serverId: string) {
    return this.serversService.remove(serverId, user.userId);
  }
}
