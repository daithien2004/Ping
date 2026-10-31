'use client';

import dayjs from 'dayjs';
import 'dayjs/locale/vi';
import { use, useEffect, useSyncExternalStore, type ReactNode } from 'react';
import { browser } from 'react-dom';
import { IntlProvider } from 'use-intl';
import { z } from 'zod';
import {
  currentLocale,
  defaultLocale,
  messagesByLocale,
  subscribeLocale,
  type AppLocale,
} from './config';

/**
 * Ngôn ngữ của toàn app, chọn trong trình duyệt từ cookie. Không đọc cookie ở server: với
 * cacheComponents, `cookies()` bắt mọi chỗ dùng bản dịch nằm trong <Suspense> (ADR-0022). App vốn
 * chỉ render ở trình duyệt nên mọi chữ render ở client, server và client không lệch nhau.
 */
export function LocaleProvider({ children }: { children: ReactNode }) {
  use(browser('Ngôn ngữ đọc từ cookie trong trình duyệt.'));
  // Không reload: `switchLocale` phát cho store này, provider đổi locale/messages tại chỗ.
  const locale = useSyncExternalStore<AppLocale>(
    subscribeLocale,
    currentLocale,
    () => defaultLocale,
  );

  // Lỗi validate (schema @ping/shared) theo cùng ngôn ngữ.
  z.config(locale === 'en' ? z.locales.en() : z.locales.vi());

  useEffect(() => {
    document.documentElement.lang = locale;
    // antd đọc locale của dayjs cho DatePicker/định dạng ngày; gọi lại mỗi lần đổi ngôn ngữ.
    dayjs.locale(locale);
  }, [locale]);

  return (
    <IntlProvider
      locale={locale}
      messages={messagesByLocale[locale]}
      timeZone={Intl.DateTimeFormat().resolvedOptions().timeZone}
    >
      {children}
    </IntlProvider>
  );
}
