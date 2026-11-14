import { Injectable, Logger } from '@nestjs/common';
import type { Mailer, MailInput } from './mailer.js';

// CỐ TÌNH không log body: thư chứa token một lần.
@Injectable()
export class ConsoleMailer implements Mailer {
  private readonly logger = new Logger(ConsoleMailer.name);

  async send(input: MailInput): Promise<void> {
    this.logger.log(`SMTP_URL chưa cấu hình — mô phỏng gửi thư tới ${input.to}: ${input.subject}`);
  }
}
