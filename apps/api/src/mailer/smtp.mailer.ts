import { Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import type { Mailer, MailInput } from './mailer.js';

/** Địa chỉ người gửi — Mailpit ở dev hiển thị tự do; dịch vụ thật cần domain đã xác thực SPF/DKIM. */
const MAIL_FROM = 'Ping <no-reply@ping.local>';

/**
 * Gửi thư qua SMTP (TG.8). Transport tạo MỘT lần từ SMTP_URL — nodemailer tự kết nối
 * lười (khi send đầu tiên) và tự gộp kết nối, nên không cần quản lý vòng đời riêng.
 * Lỗi gửi do người gọi quyết định: thư xác minh/đặt lại là fire-and-forget, chỉ log.
 */
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
      // Log lý do để chẩn đoán được SMTP hỏng, nhưng KHÔNG kèm nội dung thư (chứa token).
      this.logger.warn(
        { to: input.to, subject: input.subject, err: error as Error },
        'Gửi thư SMTP thất bại',
      );
      throw error;
    }
  }
}
