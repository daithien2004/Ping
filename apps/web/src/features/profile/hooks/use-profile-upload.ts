import { ErrorCodes, type UploadDto } from '@ping/shared';
import { useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api-client';

export interface ProfileUpload {
  busy: boolean;
  progress: number;
  attachmentId: string | null;
  error: unknown;
  choose: (file: File | undefined) => void;
  reset: () => void;
}

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
  // Không abort khi unmount: upload vẫn hoàn tất, tệp không gắn được worker dọn như mồ côi.
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
