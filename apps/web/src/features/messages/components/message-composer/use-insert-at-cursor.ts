import type { RefObject } from 'react';
import type { PingTextAreaRef } from '@/components/ui/ping-textarea';

export function useInsertAtCursor(
  textareaRef: RefObject<PingTextAreaRef | null> | undefined,
  draft: string,
  setDraft: (value: string) => void,
) {
  return (insert: string) => {
    const el = textareaRef?.current?.resizableTextArea?.textArea ?? null;
    const start = el?.selectionStart ?? draft.length;
    const end = el?.selectionEnd ?? draft.length;
    setDraft(draft.slice(0, start) + insert + draft.slice(end));
    requestAnimationFrame(() => {
      el?.focus();
      const pos = start + insert.length;
      el?.setSelectionRange(pos, pos);
    });
  };
}
