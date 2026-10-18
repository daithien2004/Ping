import { Body, Controller, Delete, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common';
import { createServerSchema, type CreateServerInput } from '@ping/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { AbilityGuard } from '../ability/ability.guard.js';
import { CheckAbility } from '../ability/check-ability.decorator.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { joinServerSchema, type JoinServerInput } from './schemas.js';
import { ServersService } from './servers.service.js';

@Controller('servers')
@UseGuards(JwtAuthGuard, AbilityGuard)
export class ServersController {
  constructor(private readonly serversService: ServersService) {}

  /** Chỉ cần đăng nhập — chưa có bối cảnh server nên không có @CheckAbility. */
  @Post()
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

  @Get(':serverId/members')
  @CheckAbility(['view', 'Member'])
  members(@Param('serverId') serverId: string) {
    return this.serversService.members(serverId);
  }

  @Post(':serverId/leave')
  @HttpCode(204)
  leave(@CurrentUser() user: AuthenticatedUser, @Param('serverId') serverId: string) {
    return this.serversService.leave(serverId, user.userId);
  }

  /** Không @CheckAbility: chỉ owner được xóa (service tier-2 kiểm tra). */
  @Delete(':serverId')
  remove(@CurrentUser() user: AuthenticatedUser, @Param('serverId') serverId: string) {
    return this.serversService.remove(serverId, user.userId);
  }
}
