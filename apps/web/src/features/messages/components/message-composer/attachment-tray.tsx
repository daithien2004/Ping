'use client';

import { useTranslations } from 'use-intl';
import { useErrorMessage } from '@/lib/error-message';
import { DraftPreview } from '@/features/attachments/components/draft-preview';
import type { DraftFile } from '@/features/attachments/hooks';

export function AttachmentTray({
  files,
  onRemove,
}: {
  files: DraftFile[];
  onRemove: (key: string) => void;
}) {
  const ta = useTranslations('attachments');
  const errorMessage = useErrorMessage();
  if (files.length === 0) return null;
  return (
    <ul aria-label={ta('files')} className="mb-2 flex flex-wrap gap-2">
      {files.map((file) => (
        <li
          key={file.key}
          className="max-w-xs rounded border bg-muted p-2 text-xs"
          data-testid="upload-draft"
        >
          <DraftPreview file={file.file} />
          <p className="truncate">{file.file.name}</p>
          <p role="status">
            {file.error
              ? errorMessage(file.error)
              : file.ready
                ? ta('ready')
                : file.progress === 100
                  ? ta('processing')
                  : ta('progress', { percent: file.progress })}
          </p>
          <button
            type="button"
            onClick={() => onRemove(file.key)}
            aria-label={ta('cancel', { name: file.file.name })}
            className="focus-ring underline"
          >
            {ta('remove')}
          </button>
        </li>
      ))}
    </ul>
  );
}
