import { useRef } from 'react';
import { usePingForm } from '@/components/ui/ping-form';
import { pingToast } from '@/components/ui/ping-toast';
import { useProfileUpload, type ProfileUpload } from '@/features/profile/hooks';
import { useErrorMessage } from '@/lib/error-message';

/**
 * Luồng chọn tệp → gợi ý tên → form tạo (sticker/emoji server dùng chung, TG.22/TG.24):
 * cùng pipeline upload TG.6, cùng chu trình chooseFile/reset/submit, chỉ khác scope upload,
 * cách gợi ý tên và payload gửi API. Nhận thẳng `mutate`/`reset` (không phải cả
 * `UseMutationResult`) để tránh kiểu generic của react-query suy diễn sai chiều.
 */
export function useUploadCreateForm<TValues extends { name: string }, TInput>({
  scope,
  serverId,
  suggestName,
  buildPayload,
  mutate,
  reset,
  successMessage,
}: {
  scope: 'sticker' | 'customEmoji';
  serverId: string;
  suggestName: (filename: string) => string;
  buildPayload: (attachmentId: string, values: TValues) => TInput;
  mutate: (
    input: TInput,
    opts: { onSuccess: () => void; onError: (error: unknown) => void },
  ) => void;
  reset: () => void;
  successMessage: string;
}) {
  const errorMessage = useErrorMessage();
  const upload = useProfileUpload(scope, serverId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [form] = usePingForm<TValues>();

  function chooseFile(file: File | undefined) {
    if (!file) return;
    form.setFieldsValue({ name: suggestName(file.name) } as Partial<TValues>);
    upload.choose(file);
  }

  function resetUpload() {
    upload.reset();
    form.resetFields();
    reset();
  }

  function submit(values: TValues) {
    if (!upload.attachmentId) return;
    mutate(buildPayload(upload.attachmentId, values), {
      onSuccess: () => {
        pingToast.success(successMessage);
        resetUpload();
      },
      onError: (error) => pingToast.error(errorMessage(error)),
    });
  }

  return { form, upload, inputRef, chooseFile, resetUpload, submit };
}

export type { ProfileUpload };
