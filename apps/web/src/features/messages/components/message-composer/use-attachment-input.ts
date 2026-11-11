'use client';

import { AttachmentLimits } from '@ping/shared';
import { useRef, type ChangeEvent, type ClipboardEvent, type DragEvent } from 'react';
import { useAttachmentDrafts } from '@/features/attachments/hooks';

const ACCEPTED_TYPES = 'image/jpeg,image/png,image/webp,application/pdf';

export function useAttachmentInput(channelId: string, interactive: boolean) {
  const uploads = useAttachmentDrafts(channelId);
  const inputRef = useRef<HTMLInputElement>(null);
  const disabled = !interactive || uploads.files.length >= AttachmentLimits.PER_MESSAGE;

  return {
    uploads,
    disabled,
    openPicker: () => inputRef.current?.click(),
    inputProps: {
      ref: inputRef,
      type: 'file' as const,
      multiple: true,
      accept: ACCEPTED_TYPES,
      disabled,
      onChange: (event: ChangeEvent<HTMLInputElement>) => {
        uploads.add(Array.from(event.target.files ?? []));
        event.target.value = '';
      },
    },
    onPaste: (event: ClipboardEvent) => {
      const pasted = Array.from(event.clipboardData.files);
      if (pasted.length && interactive) {
        event.preventDefault();
        uploads.add(pasted);
      }
    },
    onDragOver: (event: DragEvent) => {
      if (interactive) event.preventDefault();
    },
    onDrop: (event: DragEvent) => {
      event.preventDefault();
      if (interactive) uploads.add(Array.from(event.dataTransfer.files));
    },
  };
}
