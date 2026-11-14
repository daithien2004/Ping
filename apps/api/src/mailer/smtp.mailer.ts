import { Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import type { Mailer, MailInput } from './mailer.js';

// Dịch vụ thật cần domain đã xác thực SPF/DKIM.
const MAIL_FROM = 'Ping <no-reply@ping.local>';

@Injectable()
export class SmtpMailer implements Mailer {
  private readonly transport: Transporter;
  private readonly logger = new Logger(SmtpMailer.name);

  constructor(smtpUrl: string) {
    this.transport = createTransport(smtpUrl);
  }

  async send(input: MailInput): Promise<void> {
    try {
      await this.transport.sendMail({
        from: MAIL_FROM,
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
      });
    } catch (error) {
      // Log lý do để chẩn đoán SMTP hỏng, nhưng KHÔNG kèm nội dung thư (chứa token).
      this.logger.warn(
        { to: input.to, subject: input.subject, err: error as Error },
        'Gửi thư SMTP thất bại',
      );
      throw error;
    }
  }
}
