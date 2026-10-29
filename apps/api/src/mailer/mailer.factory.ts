import type { Env } from '../config/env.schema.js';
import { ConsoleMailer } from './console.mailer.js';
import type { Mailer } from './mailer.js';
import { SmtpMailer } from './smtp.mailer.js';

/**
 * Chọn hiện thực Mailer theo env (TG.8): có SMTP_URL → SmtpMailer (Mailpit ở dev,
 * dịch vụ thật ở staging); bỏ trống → ConsoleMailer chỉ ghi log. Hàm thuần để unit test
 * được nhánh chọn; MailerModule chỉ bọc nó thành provider DI.
 */
export function createMailer(smtpUrl: Env['SMTP_URL']): Mailer {
  return smtpUrl ? new SmtpMailer(smtpUrl) : new ConsoleMailer();
}
