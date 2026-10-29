/**
 * Cổng Mailer (TG.8) — một interface, hai hiện thực:
 *  - SmtpMailer: gửi qua SMTP thật (Mailpit ở dev, dịch vụ thư ở staging/production).
 *  - ConsoleMailer: chỉ ghi log khi SMTP_URL bỏ trống — dev không cần Mailpit vẫn chạy được.
 *
 * Nội dung thư chứa token một lần (xác minh email / đặt lại mật khẩu) nên KHÔNG BAO GIỜ
 * log body — chỉ log người nhận và tiêu đề (quy tắc 11: không log token).
 */
export interface MailInput {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  send(input: MailInput): Promise<void>;
}

/** Token DI cho Mailer — hiện thực do MailerModule chọn theo env SMTP_URL. */
export const MAILER = 'MAILER';
