import { ErrorCodes, type UploadDto } from '@ping/shared';
import { useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api-client';

export interface ProfileUpload {
  /** Đang có một tệp được chọn; người dùng chưa thể chọn tệp khác. */
  busy: boolean;
  progress: number;
  /** attachment `ready` — dùng làm avatarAttachmentId/iconAttachmentId. */
  attachmentId: string | null;
  error: unknown;
  /** Chọn tệp (input type=file) và bắt đầu luồng reserve → PUT → complete → chờ ready. */
  choose: (file: File | undefined) => void;
  reset: () => void;
}

/**
 * Upload một tệp hồ sơ qua pipeline TG.6 (ADR-0053): reserve → PUT nhị phân → complete →
 * poll tới `ready`. Luồng đi qua cùng khoá hạn mức, cùng worker kiểm định như tệp tin nhắn.
 * TG.22: scope `sticker` tái dùng đúng luồng này cho màn quản trị sticker của server.
 * TG.24: scope `customEmoji` tương tự cho màn quản trị emoji (WebP ≤ 128×128, trần 50+50).
 */
export function useProfileUpload(
  scope: 'avatar' | 'serverIcon' | 'sticker' | 'customEmoji',
  serverId?: string,
): ProfileUpload {
  const [state, setState] = useState<{
    busy: boolean;
    progress: number;
    attachmentId: string | null;
    error: unknown;
  }>({ busy: false, progress: 0, attachmentId: null, error: undefined });
  // Không abort khi component unmount: modal đóng giữa chừng thì upload vẫn hoàn tất và
  // tệp không gắn sẽ được worker dọn như mồ côi (ADR-0053). Controller chỉ để hủy PUT/progress.
  const controllerRef = useRef<AbortController | null>(null);

  const choose = (file: File | undefined) => {
    if (!file || state.busy) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ busy: true, progress: 0, attachmentId: null, error: undefined });
    void (async () => {
      try {
        const created = await api.post<UploadDto>('/uploads', {
          scope,
          ...(serverId ? { serverId } : {}),
          filename: file.name,
          sizeBytes: file.size,
          nonce: crypto.randomUUID(),
        });
        if (controller.signal.aborted) return;
        await api.upload(`/uploads/${created.id}/content`, file, controller.signal, (progress) =>
          setState((old) => ({ ...old, progress })),
        );
        if (controller.signal.aborted) return;
        await api.post(`/uploads/${created.id}/complete`);
        for (let i = 0; i < 40; i++) {
          if (controller.signal.aborted) return;
          const status = await api.get<UploadDto>(`/uploads/${created.id}`);
          if (status.status === 'ready') {
            setState({ busy: false, progress: 100, attachmentId: created.id, error: undefined });
            return;
          }
          if (['rejected', 'deleted', 'deleting'].includes(status.status))
            throw new ApiError(400, ErrorCodes.UPLOAD_INVALID, 'Invalid file');
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
        throw new ApiError(503, ErrorCodes.SERVICE_UNAVAILABLE, 'Processing timeout');
      } catch (error) {
        if (!controller.signal.aborted)
          setState({ busy: false, progress: 0, attachmentId: null, error });
      }
    })();
  };

  return {
    busy: state.busy,
    progress: state.progress,
    attachmentId: state.attachmentId,
    error: state.error,
    choose,
    reset: () => setState({ busy: false, progress: 0, attachmentId: null, error: undefined }),
  };
}
