import { createParamDecorator, type ExecutionContext } from '@nestjs/common';

/** Payload mà JwtAuthGuard đã xác minh và gắn vào request. */
export interface AuthenticatedUser {
  userId: string;
  username: string;
  /**
   * TG.8: id hàng Session phát hành token này (claim `sid`) — dùng đánh dấu "phiên hiện
   * tại" trong danh sách phiên và thu hồi "mọi phiên khác". Undefined với JWT cũ phát
   * hành trước TG.8 (triển khai cuốn chiếu) — endpoint phiên rơi về nhánh an toàn.
   */
  sessionId?: string;
}

/** Lấy user từ request: `@CurrentUser() user: AuthenticatedUser`. */
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthenticatedUser => {
    const request = ctx.switchToHttp().getRequest<{ user: AuthenticatedUser }>();
    return request.user;
  },
);
