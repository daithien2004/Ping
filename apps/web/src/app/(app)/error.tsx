'use client';

import { ErrorCodes } from '@ping/shared';
import { useQueryErrorResetBoundary } from '@tanstack/react-query';
import Link from 'next/link';
import { useTranslations } from 'use-intl';
import { Button } from '@/components/ui/button';
import { useErrorMessage } from '@/lib/error-message';

/**
 * Lỗi trong vùng nội dung (sidebar channel + channel). Nằm ở cấp `(app)` vì error.tsx không bắt
 * lỗi trong layout.tsx cùng cấp — sidebar ở layout của servers/[serverId]. Cột server (layout
 * `(app)`) vẫn hiện để người dùng chuyển sang server khác.
 */
export default function AppError({ error, retry }: { error: Error; retry: () => void }) {
  // useSuspenseQuery giữ lỗi trong cache: phải xóa trạng thái lỗi của query trước, rồi retry()
  // của Next mới thật sự tải lại thay vì ném lại đúng lỗi cũ.
  const { reset } = useQueryErrorResetBoundary();
  const t = useTranslations();
  const errorMessage = useErrorMessage();

  return (
    <div role="alert" className="m-auto flex flex-col items-center gap-3 text-center">
      <h2 className="text-lg font-semibold">{t('app.accessDenied')}</h2>
      <p className="text-sm text-muted-foreground">
        {errorMessage(error, {
          [ErrorCodes.FORBIDDEN]: t('app.notMember'),
          [ErrorCodes.NOT_FOUND]: t('app.notFound'),
          [ErrorCodes.VALIDATION_ERROR]: t('app.invalidPath'),
        })}
      </p>
      <div className="flex gap-2">
        <Button
          variant="outline"
          onClick={() => {
            reset();
            retry();
          }}
        >
          {t('common.retry')}
        </Button>
        <Button asChild>
          <Link href="/">{t('common.goHome')}</Link>
        </Button>
      </div>
    </div>
  );
}
