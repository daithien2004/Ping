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

// forgot/resend LUÔN trả 202 cùng body dù email có tồn tại (chống dò tài khoản).
// Không dùng cookie nên không cần CsrfGuard.
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

export const MAIL_QUEUED_RESPONSE = { status: 'queued' } as const;
