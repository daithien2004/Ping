'use client';

import { useEffect } from 'react';
import { GlobalErrorView } from '@/components/global-error-view';
import { localeFromCookie } from '@/i18n/config';
import { errorReference } from '@/lib/error-reference';
import { reportError } from '@/lib/report-error';

/**
 * Lỗi ở chính root layout (providers, font…): error.tsx không bắt được, nếu không có file này người
 * dùng thấy màn hình lỗi mặc định của Next. Thay thế cả <html>, nên xem GlobalErrorView.
 */
export default function GlobalError({ error, retry }: { error: Error; retry: () => void }) {
  useEffect(() => {
    reportError(error, { boundary: 'global-error' });
  }, [error]);

  return (
    <GlobalErrorView
      locale={localeFromCookie(document.cookie)}
      reference={errorReference(error)}
      onRetry={retry}
    />
  );
}
