import { Body, Controller, Delete, Get, HttpCode, Param, Patch, UseGuards } from '@nestjs/common';
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
import { AccountService } from '../auth/account.service.js';
import { AuthService } from '../auth/auth.service.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { UsersService } from './users.service.js';

/** Toàn bộ /users yêu cầu đăng nhập — khai báo guard một lần ở controller. */
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
    private readonly accountService: AccountService,
  ) {}

  @Get('me')
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.me(user.userId);
  }

  /** TG.7: đổi tên hiển thị/ avatar; controller mỏng — bind attachment và phát event ở service. */
  @Patch('me')
  updateMe(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateProfileSchema)) body: UpdateProfileInput,
  ) {
    return this.usersService.updateProfile(user.userId, body);
  }

  /**
   * TG.13: đọc mức riêng tư hiện tại để trang cài đặt hiển thị đúng trạng thái đã lưu (TG.9
   * chỉ có PATCH; thiếu GET thì switch hiển thị mặc định, sai sau khi đổi ở thiết bị khác).
   */
  @Get('me/privacy')
  getPrivacy(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getPrivacy(user.userId);
  }

  /**
   * TG.9 (ADR-0070 mục 11): cài đặt riêng tư — mức nhận DM. ADR dẫn `PATCH /users/me` nhưng
   * route đó đã là hợp đồng TG.7 (updateProfileSchema: displayName/avatar); tách endpoint
   * riêng với `updatePrivacySchema` giữ nguyên hợp đồng cũ và mỗi schema một luồng rõ ràng.
   */
  @Patch('me/privacy')
  updatePrivacy(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updatePrivacySchema)) body: UpdatePrivacyInput,
  ) {
    return this.usersService.updatePrivacy(user.userId, body);
  }

  /**
   * TG.13: cài đặt giao diện/ngôn ngữ của chính người gọi (user-scoped — userId từ JWT,
   * không có id trên path). GET lazy khi chưa có hàng (trả mặc định, không tạo — lý do ở
   * UsersService.getSettings); PATCH upsert: body rỗng/giá trị lạ bị zod chặn ở pipe → 400.
   */
  @Get('me/settings')
  getSettings(@CurrentUser() user: AuthenticatedUser) {
    return this.usersService.getSettings(user.userId);
  }

  @Patch('me/settings')
  updateSettings(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(updateUserSettingsSchema)) body: UpdateUserSettingsInput,
  ) {
    return this.usersService.updateSettings(user.userId, body);
  }

  /**
   * TG.8: đổi mật khẩu khi biết mật khẩu hiện tại — các phiên KHÁC phiên hiện tại bị
   * thu hồi (phiên hiện tại sống nhờ claim `sid` trong JWT). 204 không body.
   */
  @Patch('me/password')
  @HttpCode(204)
  changePassword(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(changePasswordSchema)) body: ChangePasswordInput,
  ) {
    return this.accountService.changePassword(user.userId, body, user.sessionId);
  }

  /** TG.8: danh sách phiên (thiết bị, lần dùng gần nhất, phiên hiện tại) — mới dùng trước. */
  @Get('me/sessions')
  listSessions(@CurrentUser() user: AuthenticatedUser) {
    return this.accountService.listSessions(user.userId, user.sessionId);
  }

  /** TG.8: thu hồi MỌI phiên khác — đăng xuất các thiết bị còn lại, giữ phiên hiện tại. */
  @Delete('me/sessions')
  @HttpCode(204)
  revokeOtherSessions(@CurrentUser() user: AuthenticatedUser) {
    return this.accountService.revokeOtherSessions(user.userId, user.sessionId);
  }

  /**
   * TG.8: thu hồi đúng một phiên của chính mình (IDOR: service tra theo cả userId của
   * người gọi — phiên của người khác là 404; đưa vào ID_ROUTES + bảng tấn công idor.e2e).
   */
  @Delete('me/sessions/:sessionId')
  @HttpCode(204)
  revokeSession(@CurrentUser() user: AuthenticatedUser, @Param('sessionId') sessionId: string) {
    return this.accountService.revokeSession(user.userId, sessionId);
  }
}
