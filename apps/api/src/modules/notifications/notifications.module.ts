import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';

/** TG.12: prefs thông báo — GET/PUT/DELETE /users/me/notification-prefs; chỉ lưu + đọc,
 * badge/notification do client tính (không event, không realtime). */
@Module({
  imports: [AuthModule],
  controllers: [NotificationsController],
  providers: [NotificationsService],
})
export class NotificationsModule {}
