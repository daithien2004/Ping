import { Body, Controller, HttpCode, Post, Req, Res, UseGuards, UsePipes } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import { loginSchema, registerSchema, type LoginInput, type RegisterInput } from '@ping/shared';
import type { Request, Response } from 'express';
import { RateLimitFailClosed } from '../../common/decorators.js';
import { CsrfGuard } from '../../common/guards/csrf.guard.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import type { Env } from '../../config/env.schema.js';
import { REFRESH_COOKIE_NAME, REFRESH_COOKIE_PATH } from './auth.constants.js';
import { AuthService, type AuthRequestContext, type RefreshCookieValue } from './auth.service.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /**
   * Rate limit riêng 5 lần/phút/IP — chặt hơn global 100/phút vì đây là cửa khẩu
   * credential stuffing: attacker thử hàng nghìn mật khẩu/phút, mỗi thử là một
   * lần argon2.verify tốn CPU. Global 100 là phòng cháy, cái này là khóa cửa.
   */
  @Post('register')
  @RateLimitFailClosed()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @UsePipes(new ZodValidationPipe(registerSchema))
  async register(
    @Body() body: RegisterInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, accessToken, refreshCookie } = await this.authService.register(
      body,
      this.context(req),
    );
    this.setRefreshCookie(res, refreshCookie);
    return { user, accessToken };
  }

  @Post('login')
  @RateLimitFailClosed()
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @UsePipes(new ZodValidationPipe(loginSchema))
  async login(
    @Body() body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, accessToken, refreshCookie } = await this.authService.login(
      body,
      this.context(req),
    );
    this.setRefreshCookie(res, refreshCookie);
    return { user, accessToken };
  }

  /** Không cần JwtAuthGuard: tự xác thực hoàn toàn bằng cookie httpOnly. */
  @Post('refresh')
  @UseGuards(CsrfGuard)
  @RateLimitFailClosed()
  @HttpCode(200)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const { accessToken, refreshCookie } = await this.authService.refresh(
      this.refreshCookie(req),
      this.context(req),
    );
    this.setRefreshCookie(res, refreshCookie);
    return { accessToken };
  }

  @Post('logout')
  @UseGuards(CsrfGuard)
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await this.authService.logout(this.refreshCookie(req));
    res.clearCookie(REFRESH_COOKIE_NAME, { path: REFRESH_COOKIE_PATH });
  }

  private refreshCookie(req: Request): string | undefined {
    return (req.cookies as Record<string, string | undefined>)[REFRESH_COOKIE_NAME];
  }

  private context(req: Request): AuthRequestContext {
    return { ip: req.ip, userAgent: req.headers['user-agent'] };
  }

  private setRefreshCookie(res: Response, cookie: RefreshCookieValue): void {
    res.cookie(REFRESH_COOKIE_NAME, cookie.token, {
      httpOnly: true,
      // Secure = chỉ gửi qua https. Dev chạy http://localhost nên bật sẵn sẽ mất cookie.
      secure: this.config.getOrThrow('NODE_ENV', { infer: true }) === 'production',
      // localhost:3000 → localhost:4000 vẫn same-site (port không tính),
      // nên SameSite=Lax hoạt động trong dev lẫn production cùng-site (guide 9.3).
      sameSite: 'lax',
      path: REFRESH_COOKIE_PATH,
      expires: cookie.expiresAt,
    });
  }
}
