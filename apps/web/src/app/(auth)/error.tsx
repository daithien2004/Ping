'use client';

import { useQueryErrorResetBoundary } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useTranslations } from 'use-intl';
import { Button } from '@/components/ui/button';
import { errorReference } from '@/lib/error-reference';
import { useErrorMessage } from '@/lib/error-message';
import { reportError } from '@/lib/report-error';

/**
 * Lỗi ở trang chưa đăng nhập (đăng nhập/đăng ký). Không có boundary ở đây thì lỗi mạng lúc
 * kiểm tra phiên (`useMe` là suspense query) làm sập trang: Next rơi xuống global-error —
 * mất trắng toàn bộ, không có cách phục hồi ngoài việc tải lại.
 */
export default function AuthError({ error, retry }: { error: Error; retry: () => void }) {
  // useSuspenseQuery giữ lỗi trong cache: phải xóa trạng thái lỗi của query trước, rồi retry()
  // của Next mới thật sự tải lại thay vì ném lại đúng lỗi cũ.
  const { reset } = useQueryErrorResetBoundary();
  const t = useTranslations();
  const errorMessage = useErrorMessage();
  useEffect(() => {
    reportError(error, { boundary: 'auth-error' });
  }, [error]);
  const message = errorMessage(error);
  const reference = errorReference(error);

  return (
    <div role="alert" className="flex w-full max-w-sm flex-col items-center gap-3 text-center">
      <h1 className="text-lg font-semibold">{t('app.authErrorTitle')}</h1>
      <p className="text-sm text-muted-foreground">{t('app.authErrorHint')}</p>
      <p className="text-sm text-destructive">{message}</p>
      {reference && !message.includes(reference) && (
        <p className="text-xs text-muted-foreground">
          <code className="select-all">{t('app.errorId', { id: reference })}</code>
        </p>
      )}
      <Button
        variant="outline"
        onClick={() => {
          reset();
          retry();
        }}
      >
        {t('common.retry')}
      </Button>
    </div>
  );
}
