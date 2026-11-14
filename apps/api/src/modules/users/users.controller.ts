import { Body, Controller, Delete, Get, HttpCode, Param, Patch, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  changePasswordSchema,
  updatePrivacySchema,
  updateProfileSchema,
  updateUserSettingsSchema,
  type ChangePasswordInput,
  type UpdatePrivacyInput,
  type UpdateProfileInput,
  type UpdateUserSettingsInput,
} from '@ping/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { RATE_LIMIT_BUCKETS } from '../../common/rate-limit-buckets.js';
import { AccountService } from '../auth/account.service.js';
import { AuthService } from '../auth/auth.service.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { ReadStateService } from '../channels/read-state.service.js';
import { UsersService } from './users.service.js';

@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly accountService: AccountService,
    private readonly readState: ReadStateService,
  ) {}

  @Get('me')
  @Throttle({ default: RATE_LIMIT_BUCKETS.readLight })
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.me(user.userId);
  }

  @Get('me/unread')
  @Throttle({ default: RATE_LIMIT_BUCKETS.readLight })
  unread(@CurrentUser() user: AuthenticatedUser) {
    return this.readState.unreadForUser(user.userId);
  }

  @Patch('me')
  @Throttle({ default: RATE_LIMIT_BUCKETS.writeStructure })
  updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateProfileSchema)) body: UpdateProfileInput,
  ) {
    return this.usersService.updateProfile(user.userId, body);
  }

  @Get('me/privacy')
  @Throttle({ default: RATE_LIMIT_BUCKETS.readLight })
  getPrivacy(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getPrivacy(user.userId);
  }

  @Patch('me/privacy')
  @Throttle({ default: RATE_LIMIT_BUCKETS.writeStructure })
  updatePrivacy(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updatePrivacySchema)) body: UpdatePrivacyInput,
  ) {
    return this.usersService.updatePrivacy(user.userId, body);
  }

  @Get('me/settings')
  @Throttle({ default: RATE_LIMIT_BUCKETS.readLight })
  getSettings(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getSettings(user.userId);
  }

  @Patch('me/settings')
  @Throttle({ default: RATE_LIMIT_BUCKETS.writeStructure })
  updateSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateUserSettingsSchema)) body: UpdateUserSettingsInput,
  ) {
    return this.usersService.updateSettings(user.userId, body);
  }

  @Patch('me/password')
  @Throttle({ default: RATE_LIMIT_BUCKETS.writeStructure })
  @HttpCode(204)
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(changePasswordSchema)) body: ChangePasswordInput,
  ) {
    return this.accountService.changePassword(user.userId, body, user.sessionId);
  }

  @Get('me/sessions')
  @Throttle({ default: RATE_LIMIT_BUCKETS.readLight })
  listSessions(@CurrentUser() user: AuthenticatedUser) {
    return this.accountService.listSessions(user.userId, user.sessionId);
  }

  @Delete('me/sessions')
  @Throttle({ default: RATE_LIMIT_BUCKETS.writeStructure })
  @HttpCode(204)
  revokeOtherSessions(@CurrentUser() user: AuthenticatedUser) {
    return this.accountService.revokeOtherSessions(user.userId, user.sessionId);
  }

  @Delete('me/sessions/:sessionId')
  @Throttle({ default: RATE_LIMIT_BUCKETS.writeStructure })
  @HttpCode(204)
  revokeSession(@CurrentUser() user: AuthenticatedUser, @Param('sessionId') sessionId: string) {
    return this.accountService.revokeSession(user.userId, sessionId);
  }
}
