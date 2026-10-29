import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import {
  forgotPasswordSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  verifyEmailSchema,
  type ForgotPasswordInput,
  type ResendVerificationInput,
  type ResetPasswordInput,
  type VerifyEmailInput,
} from '@ping/shared';
import type { Request } from 'express';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { AccountService } from './account.service.js';

/**
 * Các endpoint vòng đời tài khoản không cần đăng nhập (TG.8). Không dùng cookie nên
 * không cần CsrfGuard (quy tắc 18 chỉ áp cho endpoint xác thực bằng cookie).
 *
 * Chống dò tài khoản: forgot/resend LUÔN trả 202 với body giống hệt nhau dù email có
 * tồn tại hay không — "đã nhận yêu cầu" chỉ nghĩa là yêu cầu được chấp nhận xử lý.
 * 202 thay vì 204: hành động được xếp hàng (gửi thư bất đồng bộ), chưa hoàn tất.
 */
@Controller('auth')
export class AccountController {
  constructor(private readonly accountService: AccountService) {}

  @Post('verify-email')
  @HttpCode(204)
  verifyEmail(@Body(new ZodValidationPipe(verifyEmailSchema)) body: VerifyEmailInput) {
    return this.accountService.verifyEmail(body.token);
  }

  @Post('password/forgot')
  @HttpCode(202)
  async forgotPassword(
    @Body(new ZodValidationPipe(forgotPasswordSchema)) body: ForgotPasswordInput,
    @Req() req: Request,
  ): Promise<typeof MAIL_QUEUED_RESPONSE> {
    // await để 429 (rate limit) và lỗi validate truyền ra response; gửi thư bên trong
    // vẫn fire-and-forget nên response không chờ SMTP.
    await this.accountService.forgotPassword(body.email, req.ip ?? 'unknown');
    return MAIL_QUEUED_RESPONSE;
  }

  @Post('password/reset')
  @HttpCode(204)
  resetPassword(@Body(new ZodValidationPipe(resetPasswordSchema)) body: ResetPasswordInput) {
    return this.accountService.resetPassword(body.token, body.password);
  }

  @Post('verify-email/resend')
  @HttpCode(202)
  async resendVerification(
    @Body(new ZodValidationPipe(resendVerificationSchema)) body: ResendVerificationInput,
    @Req() req: Request,
  ): Promise<typeof MAIL_QUEUED_RESPONSE> {
    await this.accountService.resendVerification(body.email, req.ip ?? 'unknown');
    return MAIL_QUEUED_RESPONSE;
  }
}

/** Body cố định của 202 — giống hệt cho mọi trường hợp, không tiết lộ email có tồn tại. */
export const MAIL_QUEUED_RESPONSE = { status: 'queued' } as const;
