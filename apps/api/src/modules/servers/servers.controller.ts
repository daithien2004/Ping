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
import { Throttle } from '@nestjs/throttler';
import {
  createServerSchema,
  joinServerSchema,
  listMembersQuerySchema,
  regenerateInviteSchema,
  updateNicknameSchema,
  updateServerSchema,
  type CreateServerInput,
  type JoinServerInput,
  type ListMembersQuery,
  type RegenerateInviteInput,
  type UpdateNicknameInput,
  type UpdateServerInput,
} from '@ping/shared';
import { IdempotencyInterceptor } from '../../common/interceptors/idempotency.interceptor.js';
import { RATE_LIMIT_BUCKETS } from '../../common/rate-limit-buckets.js';
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

  /** Chỉ cần đăng nhập: chưa có bối cảnh server nên không có @CheckAbility. */
  @Post()
  @Throttle({ default: RATE_LIMIT_BUCKETS.writeStructure })
  @UseInterceptors(IdempotencyInterceptor)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createServerSchema)) body: CreateServerInput,
  ) {
    return this.serversService.create(user.userId, body.name);
  }

  @Get()
  @Throttle({ default: RATE_LIMIT_BUCKETS.readLight })
  list(@CurrentUser() user: AuthenticatedUser) {
    return this.serversService.listForUser(user.userId);
  }

  @Post('join')
  @Throttle({ default: RATE_LIMIT_BUCKETS.writeStructure })
  join(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(joinServerSchema)) body: JoinServerInput,
  ) {
    return this.serversService.join(user.userId, body.inviteCode);
  }

  @Get(':serverId')
  @Throttle({ default: RATE_LIMIT_BUCKETS.readLight })
  @CheckAbility(['view', 'Server'])
  detail(@Param('serverId') serverId: string) {
    return this.serversService.detail(serverId);
  }

  @Patch(':serverId')
  @Throttle({ default: RATE_LIMIT_BUCKETS.writeStructure })
  @CheckAbility(['update', 'Server'])
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('serverId') serverId: string,
    @Body(new ZodValidationPipe(updateServerSchema)) body: UpdateServerInput,
  ) {
    return this.serversService.update(serverId, user.userId, body);
  }

  @Patch(':serverId/members/me')
  @Throttle({ default: RATE_LIMIT_BUCKETS.writeStructure })
  @CheckAbility(['update', 'Member'])
  updateMyNickname(
    @CurrentUser() user: AuthenticatedUser,
    @Param('serverId') serverId: string,
    @Body(new ZodValidationPipe(updateNicknameSchema)) body: UpdateNicknameInput,
  ) {
    return this.serversService.updateMyNickname(serverId, user.userId, body.nickname);
  }

  @Post(':serverId/invite/regenerate')
  @Throttle({ default: RATE_LIMIT_BUCKETS.writeStructure })
  @CheckAbility(['update', 'Server'])
  @UseInterceptors(IdempotencyInterceptor)
  regenerateInvite(
    @CurrentUser() user: AuthenticatedUser,
    @Param('serverId') serverId: string,
    @Body(new ZodValidationPipe(regenerateInviteSchema)) body: RegenerateInviteInput,
  ) {
    return this.serversService.regenerate(serverId, user.userId, body);
  }

  @Get(':serverId/me/permissions')
  @Throttle({ default: RATE_LIMIT_BUCKETS.readLight })
  @CheckAbility(['view', 'Server'])
  myPermissions(@CurrentUser() user: AuthenticatedUser, @Param('serverId') serverId: string) {
    return this.serversService.myPermissions(serverId, user.userId);
  }

  @Get(':serverId/members')
  @Throttle({ default: RATE_LIMIT_BUCKETS.readLight })
  @CheckAbility(['view', 'Member'])
  members(
    @Param('serverId') serverId: string,
    @Query(new ZodValidationPipe(listMembersQuerySchema)) query: ListMembersQuery,
  ) {
    return this.serversService.members(serverId, query);
  }

  @Post(':serverId/leave')
  @Throttle({ default: RATE_LIMIT_BUCKETS.writeStructure })
  @HttpCode(204)
  leave(@CurrentUser() user: AuthenticatedUser, @Param('serverId') serverId: string) {
    return this.serversService.leave(serverId, user.userId);
  }

  @Delete(':serverId/members/:memberId')
  @Throttle({ default: RATE_LIMIT_BUCKETS.writeStructure })
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
  @Throttle({ default: RATE_LIMIT_BUCKETS.writeStructure })
  remove(@CurrentUser() user: AuthenticatedUser, @Param('serverId') serverId: string) {
    return this.serversService.remove(serverId, user.userId);
  }
}
