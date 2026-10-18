import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service.js';
import type { AuthenticatedUser } from './current-user.decorator.js';

/**
 * Xác thực access JWT (header `Authorization: Bearer`) rồi gắn user vào request.
 *
 * Guard tự verify trực tiếp thay vì dùng passport: về sau Socket.IO handshake
 * chỉ cần gọi lại `authService.verifyAccessToken(token)` — cùng một nơi xác thực,
 * không đụng tới guard. Passport strategy vốn xoay quanh HttpRequest nên tách
 * ra dùng cho socket rất gượng ép.
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly authService: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthenticatedUser }>();
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : undefined;

    if (!token) {
      throw new UnauthorizedException('Missing access token');
    }

    try {
      request.user = await this.authService.verifyAccessToken(token);
      return true;
    } catch {
      // Không tiết lộ lý do thật (hết hạn hay sai chữ ký) — client chỉ cần biết: 401, đăng nhập lại.
      throw new UnauthorizedException('Invalid or expired access token');
    }
  }
}
