'use client';

import { use, useEffect, type ReactNode } from 'react';
import { browser } from 'react-dom';
import { IntlProvider } from 'use-intl';
import { z } from 'zod';
import { localeFromCookie, messagesByLocale } from './config';

/**
 * Ngôn ngữ của toàn app, chọn trong trình duyệt từ cookie. Không đọc cookie ở server: với
 * cacheComponents, `cookies()` bắt mọi chỗ dùng bản dịch nằm trong <Suspense> (ADR-0022). App vốn
 * chỉ render ở trình duyệt nên mọi chữ render ở client, server và client không lệch nhau.
 */
export function LocaleProvider({ children }: { children: ReactNode }) {
  use(browser('Ngôn ngữ đọc từ cookie trong trình duyệt.'));
  const locale = localeFromCookie(document.cookie);

  // Lỗi validate (schema @ping/shared) theo cùng ngôn ngữ. Đổi ngôn ngữ = tải lại trang.
  z.config(locale === 'en' ? z.locales.en() : z.locales.vi());

  useEffect(() => {
    document.documentElement.lang = locale;
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
