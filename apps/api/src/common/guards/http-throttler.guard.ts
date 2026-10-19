import { type ExecutionContext, Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

/**
 * ThrottlerGuard toàn cục cũng chạy cho handler WebSocket, nhưng nó đọc ngữ cảnh
 * như HTTP: `req.ip` của socket là undefined (mọi socket chung MỘT bộ đếm) và
 * `res` là payload event (null → TypeError). Giới hạn tần suất cho socket nằm ở
 * gateway (theo từng socket); guard này chỉ lo HTTP.
 */
@Injectable()
export class HttpThrottlerGuard extends ThrottlerGuard {
  override canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== 'http') {
      return Promise.resolve(true);
    }
    return super.canActivate(context);
  }
}
