import type { Env } from '../config/env.schema.js';
import { ConsoleMailer } from './console.mailer.js';
import type { Mailer } from './mailer.js';
import { SmtpMailer } from './smtp.mailer.js';

export function createMailer(smtpUrl: Env['SMTP_URL']): Mailer {
  return smtpUrl ? new SmtpMailer(smtpUrl) : new ConsoleMailer();
}
