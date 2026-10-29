import type { MailInput } from './mailer.js';

/**
 * Mẫu thư vi/en (TG.8): xác minh email và đặt lại mật khẩu. Tiêu đề KHÔNG chứa URL/token
 * để e2e đối soát được; link một lần nằm trong body. Cấu trúc HTML tối giản — bảng màu
 * phẳng, không ảnh tải từ mạng (thư không vào spam vì không có tài nguyên ngoài).
 */

export type MailLocale = 'vi' | 'en';

/** Ngôn ngữ thư theo cài đặt người dùng (TG.13); giá trị lạ/rỗng quy về tiếng Việt mặc định. */
export function mailLocaleOf(locale: string | undefined | null): MailLocale {
  return locale === 'en' ? 'en' : 'vi';
}

interface TemplateCopy {
  subject: string;
  greeting: string;
  intro: string;
  action: string;
  fallback: string;
  expiry: string;
  footer: string;
}

const VERIFY_COPY: Record<MailLocale, TemplateCopy> = {
  vi: {
    subject: 'Xác minh email Ping',
    greeting: 'Chào bạn,',
    intro: 'Hãy xác minh địa chỉ email cho tài khoản Ping của bạn.',
    action: 'Xác minh email',
    fallback: 'Nếu nút không hoạt động, dán liên kết này vào trình duyệt:',
    expiry: 'Liên kết có hiệu lực trong 24 giờ và chỉ dùng được một lần.',
    footer: 'Bạn không tạo tài khoản nào? Bỏ qua email này.',
  },
  en: {
    subject: 'Verify your Ping email',
    greeting: 'Hi there,',
    intro: 'Please verify the email address of your Ping account.',
    action: 'Verify email',
    fallback: 'If the button does not work, paste this link into your browser:',
    expiry: 'The link is valid for 24 hours and can be used only once.',
    footer: 'Did not sign up? You can safely ignore this email.',
  },
};

const RESET_COPY: Record<MailLocale, TemplateCopy> = {
  vi: {
    subject: 'Đặt lại mật khẩu Ping',
    greeting: 'Chào bạn,',
    intro: 'Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản của bạn.',
    action: 'Đặt lại mật khẩu',
    fallback: 'Nếu nút không hoạt động, dán liên kết này vào trình duyệt:',
    expiry: 'Liên kết có hiệu lực trong 30 phút và chỉ dùng được một lần.',
    footer: 'Bạn không yêu cầu đặt lại mật khẩu? Bỏ qua email này, mật khẩu giữ nguyên.',
  },
  en: {
    subject: 'Reset your Ping password',
    greeting: 'Hi there,',
    intro: 'We received a request to reset the password of your account.',
    action: 'Reset password',
    fallback: 'If the button does not work, paste this link into your browser:',
    expiry: 'The link is valid for 30 minutes and can be used only once.',
    footer: 'Did not request a reset? Ignore this email — your password stays unchanged.',
  },
};

function render(copy: TemplateCopy, url: string): Omit<MailInput, 'to'> {
  return {
    subject: copy.subject,
    text: `${copy.greeting}\n\n${copy.intro}\n\n${copy.fallback}\n${url}\n\n${copy.expiry}\n\n${copy.footer}`,
    html: [
      '<div style="font-family:system-ui,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1f2430">',
      `<p>${copy.greeting}</p>`,
      `<p>${copy.intro}</p>`,
      `<p style="margin:24px 0"><a href="${url}" style="background:#5865f2;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;display:inline-block">${copy.action}</a></p>`,
      `<p style="color:#5c6270">${copy.fallback}</p>`,
      `<p style="word-break:break-all"><a href="${url}">${url}</a></p>`,
      `<p style="color:#5c6270">${copy.expiry}</p>`,
      `<hr style="border:none;border-top:1px solid #e3e5ec;margin:24px 0">`,
      `<p style="color:#8b90a0">${copy.footer}</p>`,
      '</div>',
    ].join(''),
  };
}

/** Thư xác minh email — link chứa token một lần (TTL 24h). */
export function verifyEmailTemplate(locale: MailLocale, verifyUrl: string): Omit<MailInput, 'to'> {
  return render(VERIFY_COPY[locale], verifyUrl);
}

/** Thư đặt lại mật khẩu — link chứa token một lần (TTL 30 phút). */
export function resetPasswordTemplate(locale: MailLocale, resetUrl: string): Omit<MailInput, 'to'> {
  return render(RESET_COPY[locale], resetUrl);
}
