import { describe, expect, it } from 'vitest';
import { createMailer } from './mailer.factory.js';
import { ConsoleMailer } from './console.mailer.js';
import { SmtpMailer } from './smtp.mailer.js';
import { mailLocaleOf, resetPasswordTemplate, verifyEmailTemplate } from './templates.js';

describe('createMailer (TG.8: chọn hiện thực theo env SMTP_URL)', () => {
  it('có SMTP_URL → SmtpMailer (Mailpit ở dev, dịch vụ thật ở staging)', () => {
    expect(createMailer('smtp://127.0.0.1:1025')).toBeInstanceOf(SmtpMailer);
  });

  it('SMTP_URL bỏ trống/undefined → ConsoleMailer chỉ ghi log (dev không cần Mailpit)', () => {
    expect(createMailer(undefined)).toBeInstanceOf(ConsoleMailer);
  });
});

describe('mailLocaleOf', () => {
  it('en → en; giá trị lạ/thiếu → mặc định vi', () => {
    expect(mailLocaleOf('en')).toBe('en');
    expect(mailLocaleOf('vi')).toBe('vi');
    expect(mailLocaleOf('fr')).toBe('vi');
    expect(mailLocaleOf(undefined)).toBe('vi');
  });
});

describe('mẫu thư vi/en (TG.8)', () => {
  const url = 'http://localhost:3000/verify?token=abc-123_DEF';

  it('verify-email: đủ subject/text/html, link nằm trong body cả hai bản', () => {
    for (const locale of ['vi', 'en'] as const) {
      const mail = verifyEmailTemplate(locale, url);
      expect(mail.subject).toBeTruthy();
      expect(mail.text).toContain(url);
      expect(mail.html).toContain(url);
      // Hai ngôn ngữ khác nhau thật sự.
      expect(mail.subject).not.toBe(
        verifyEmailTemplate(locale === 'vi' ? 'en' : 'vi', url).subject,
      );
    }
  });

  it('reset-password: tiêu đề khác thư verify, expiry 30 phút có trong text', () => {
    const vi = resetPasswordTemplate('vi', url);
    const verify = verifyEmailTemplate('vi', url);
    expect(vi.subject).not.toBe(verify.subject);
    expect(vi.text).toContain(url);
    expect(vi.text).toContain('30 phút');
    const en = resetPasswordTemplate('en', url);
    expect(en.text).toContain('30 minutes');
  });

  it('subject KHÔNG chứa link/token — chỉ body mang token một lần', () => {
    expect(verifyEmailTemplate('vi', url).subject).not.toContain('token');
    expect(resetPasswordTemplate('en', url).subject).not.toContain('token');
  });
});
