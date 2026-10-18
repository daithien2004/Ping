import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

/** Payload mà JwtAuthGuard đã xác minh và gắn vào request. */
export interface AuthenticatedUser {
  userId: string;
  username: string;
}

/** Lấy user từ request: `@CurrentUser() user: AuthenticatedUser`. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthenticatedUser }>();
    return request.user;
  },
);
