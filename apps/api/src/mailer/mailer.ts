export interface MailInput {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  send(input: MailInput): Promise<void>;
}

export const MAILER = 'MAILER';
