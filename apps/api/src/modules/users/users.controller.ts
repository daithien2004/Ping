import { Controller, Get, UseGuards } from '@nestjs/common';
import { AuthService } from '../auth/auth.service.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';

/** Toàn bộ /users yêu cầu đăng nhập — khai báo guard một lần ở controller. */
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly authService: AuthService) {}

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.me(user.userId);
  }
}
