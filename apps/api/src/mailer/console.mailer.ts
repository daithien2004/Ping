import { Injectable, Logger } from '@nestjs/common';
import type { Mailer, MailInput } from './mailer.js';

/**
 * Hiện thực "không có SMTP": ghi log người nhận + tiêu đề rồi coi như đã gửi.
 * Dùng khi SMTP_URL bỏ trống (dev không bật Mailpit, CI). CỐ TÌNH không log body:
 * thư xác minh/đặt lại mật khẩu chứa token một lần (quy tắc 11 — không log token).
 */
@Injectable()
export class ConsoleMailer implements Mailer {
  private readonly logger = new Logger(ConsoleMailer.name);

  async send(input: MailInput): Promise<void> {
    this.logger.log(`SMTP_URL chưa cấu hình — mô phỏng gửi thư tới ${input.to}: ${input.subject}`);
  }
}
