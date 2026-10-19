import { Body, Controller, Delete, Get, Param, Patch, Post, Put, UseGuards } from '@nestjs/common';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { AbilityGuard } from '../ability/ability.guard.js';
import { CheckAbility } from '../ability/check-ability.decorator.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RolesService } from './roles.service.js';
import {
  assignRolesSchema,
  createRoleSchema,
  updateRoleSchema,
  type AssignRolesInput,
  type CreateRoleInput,
  type UpdateRoleInput,
} from './schemas.js';

@Controller()
@UseGuards(JwtAuthGuard, AbilityGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Post('servers/:serverId/roles')
  @CheckAbility(['manage', 'Role'])
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Param('serverId') serverId: string,
    @Body(new ZodValidationPipe(createRoleSchema)) body: CreateRoleInput,
  ) {
    return this.rolesService.create(serverId, user.userId, body);
  }

  /** Màn quản trị role — cần manage Role, member thường xem role qua chi tiết server. */
  @Get('servers/:serverId/roles')
  @CheckAbility(['manage', 'Role'])
  list(@Param('serverId') serverId: string) {
    return this.rolesService.list(serverId);
  }

  @Put('servers/:serverId/members/:memberId/roles')
  @CheckAbility(['manage', 'Role'])
  assign(
    @CurrentUser() user: AuthenticatedUser,
    @Param('serverId') serverId: string,
    @Param('memberId') memberId: string,
    @Body(new ZodValidationPipe(assignRolesSchema)) body: AssignRolesInput,
  ) {
    return this.rolesService.assign(serverId, user.userId, memberId, body.roleIds);
  }

  @Patch('roles/:roleId')
  @CheckAbility(['manage', 'Role'])
  update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('roleId') roleId: string,
    @Body(new ZodValidationPipe(updateRoleSchema)) body: UpdateRoleInput,
  ) {
    return this.rolesService.update(roleId, user.userId, body);
  }

  @Delete('roles/:roleId')
  @CheckAbility(['manage', 'Role'])
  remove(@CurrentUser() user: AuthenticatedUser, @Param('roleId') roleId: string) {
    return this.rolesService.remove(roleId, user.userId);
  }
}
