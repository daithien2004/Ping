'use client';

import { ErrorCodes } from '@ping/shared';
import { useQueryErrorResetBoundary } from '@tanstack/react-query';
import Link from 'next/link';
import { errorMessage } from '@/lib/error-message';

/**
 * Lỗi trong vùng nội dung (sidebar channel + channel). Nằm ở cấp `(app)` vì error.tsx không bắt
 * lỗi trong layout.tsx cùng cấp — sidebar ở layout của servers/[serverId]. Cột server (layout
 * `(app)`) vẫn hiện để người dùng chuyển sang server khác.
 */
export default function AppError({ error, retry }: { error: Error; retry: () => void }) {
  // useSuspenseQuery giữ lỗi trong cache: phải xóa trạng thái lỗi của query trước, rồi retry()
  // của Next mới thật sự tải lại thay vì ném lại đúng lỗi cũ.
  const { reset } = useQueryErrorResetBoundary();

  return (
    <div role="alert" className="m-auto flex flex-col items-center gap-3 text-center">
      <h2 className="text-lg font-semibold">Không truy cập được</h2>
      <p className="text-sm text-gray-500">
        {errorMessage(error, {
          [ErrorCodes.FORBIDDEN]: 'Bạn không phải thành viên của server này.',
          [ErrorCodes.NOT_FOUND]: 'Server hoặc channel không tồn tại.',
          [ErrorCodes.VALIDATION_ERROR]: 'Đường dẫn không hợp lệ.',
        })}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => {
            reset();
            retry();
          }}
          className="rounded border border-gray-300 px-3 py-1 text-sm dark:border-gray-600"
        >
          Thử lại
        </button>
        <Link href="/" className="rounded bg-indigo-600 px-3 py-1 text-sm text-white">
          Về trang chủ
        </Link>
      </div>
    </div>
  );
}
