'use client';
import { AttachmentLimits, ErrorCodes, type AttachmentLink, type UploadDto } from '@ping/shared';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/api-client';
import { env } from '@/lib/env';

export interface DraftFile {
  key: string;
  file: File;
  progress: number;
  id?: string;
  ready: boolean;
  error?: unknown;
}

export function useAttachmentDrafts(channelId: string) {
  const [files, setFiles] = useState<DraftFile[]>([]);
  const active = useRef(new Map<string, { abort: AbortController; id?: string }>());
  const mutation = useMutation({
    mutationFn: async ({ file, key }: { file: File; key: string }) => {
      const controller = new AbortController();
      const entry: { abort: AbortController; id?: string } = { abort: controller };
      active.current.set(key, entry);
      const patch = (value: Partial<DraftFile>) =>
        setFiles((old) => old.map((row) => (row.key === key ? { ...row, ...value } : row)));
      try {
        const created = await api.post<UploadDto>('/uploads', {
          channelId,
          filename: file.name,
          sizeBytes: file.size,
          nonce: key,
        });
        entry.id = created.id;
        if (controller.signal.aborted) {
          void api.delete(`/uploads/${created.id}`).catch(() => undefined);
          return;
        }
        patch({ id: created.id });
        await api.upload(`/uploads/${created.id}/content`, file, controller.signal, (progress) =>
          patch({ progress }),
        );
        await api.post(`/uploads/${created.id}/complete`);
        for (let i = 0; i < 40; i++) {
          if (controller.signal.aborted) return;
          const status = await api.get<UploadDto>(`/uploads/${created.id}`);
          if (status.status === 'ready') {
            patch({ ready: true });
            return;
          }
          if (['rejected', 'deleted', 'deleting'].includes(status.status))
            throw new ApiError(400, ErrorCodes.UPLOAD_INVALID, 'Invalid file');
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }
        throw new ApiError(503, ErrorCodes.SERVICE_UNAVAILABLE, 'Processing timeout');
      } catch (error) {
        if (!controller.signal.aborted) patch({ error });
      } finally {
        active.current.delete(key);
      }
    },
  });
  // Activity hides a composer without unmounting it: release pending uploads on hide.
  useEffect(() => {
    const entries = active.current;
    return () => {
      for (const entry of entries.values()) {
        entry.abort.abort();
        if (entry.id) void api.delete(`/uploads/${entry.id}`).catch(() => undefined);
      }
      entries.clear();
      setFiles((old) => old.filter((row) => row.ready));
    };
  }, []);
  const add = (selected: File[]) => {
    const remaining = AttachmentLimits.PER_MESSAGE - files.length;
    const next = selected.slice(0, remaining).map((file) => ({
      key: crypto.randomUUID(),
      file,
      progress: 0,
      ready: false,
      ...(file.size > AttachmentLimits.FILE_BYTES || !file.size
        ? { error: new ApiError(400, ErrorCodes.UPLOAD_INVALID, 'Invalid size') }
        : {}),
    }));
    setFiles((old) => [...old, ...next]);
    for (const row of next) if (!row.error) mutation.mutate({ file: row.file, key: row.key });
  };
  const remove = (key: string) => {
    active.current.get(key)?.abort.abort();
    const row = files.find((file) => file.key === key);
    if (row?.id) void api.delete(`/uploads/${row.id}`).catch(() => undefined);
    setFiles((old) => old.filter((file) => file.key !== key));
  };
  return {
    files,
    add,
    remove,
    sent: () => setFiles([]),
    ids: files.filter((file) => file.ready && file.id).map((file) => file.id!),
    busy: files.some((file) => !file.ready),
  };
}

/** Only the authenticated metadata request is cached. Signed URLs refresh before expiry. */
export function useAttachmentLink(id: string, thumbnail = false) {
  return useQuery({
    queryKey: ['attachments', id, thumbnail],
    queryFn: async () => {
      const link = await api.get<AttachmentLink>(
        `/attachments/${id}/download${thumbnail ? '?thumbnail=1' : ''}`,
      );
      return { ...link, url: new URL(link.url, env.NEXT_PUBLIC_API_URL).href };
    },
    staleTime: 30_000,
    gcTime: 60_000,
    refetchInterval: 45_000,
    retry: false,
  });
}
