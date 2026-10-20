import type vi from '../../messages/vi.json';
import type { AppLocale } from './config';

// Key bản dịch có kiểu: t('auth.pasword') sai chính tả → tsc báo lỗi. vi.json là bản gốc;
// en.json phải có đủ key như vậy (i18n/messages.test.ts kiểm tra).
declare module 'use-intl' {
  interface AppConfig {
    Locale: AppLocale;
    Messages: typeof vi;
  }
}
