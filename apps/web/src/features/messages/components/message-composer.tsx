'use client';

import { createMessageSchema } from '@ping/shared';
import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { useTranslations } from 'use-intl';
import dynamic from 'next/dynamic';
import { Paperclip, Smile, X } from 'lucide-react';
import { PingTextArea } from '@/components/ui/ping-textarea';
import { useRealtime } from '@/features/realtime/context';
import { useServerAbility } from '@/features/permissions/context';
import { useEmojiSuggestions } from '@/features/emoji/hooks';
import { useAttachmentDrafts } from '@/features/attachments/hooks';
import { useErrorMessage } from '@/lib/error-message';
import { DraftPreview } from '@/features/attachments/components/draft-preview';

// Picker chỉ tải khi người dùng bấm nút emoji (TG.23): dataset + lưới không nằm trong
// bundle ban đầu (ADR-0058).
const EmojiPicker = dynamic(
  () => import('@/features/emoji/components/emoji-picker').then((m) => m.EmojiPicker),
  { ssr: false },
);

/** Trích fragment shortcode đang gõ cuối draft: `…:cuo` → 'cuo'; không có → null. */
function extractFragment(draft: string): string | null {
  const match = /:([a-z_]{1,20})$/.exec(draft);
  return match?.[1] ?? null;
}

/**
 * `PingTextArea` forward ref của antd `Input.TextArea` = `TextAreaRef` (bọc DOM trong
 * `resizableTextArea.textArea`), không phải HTMLTextAreaElement — cần lấy DOM thật để đọc
 * selection và `setSelectionRange` (TG.23 chỉ gọi `focus()` nên lỗi này ẩn).
 */
function resolveTextArea(ref: HTMLTextAreaElement | null): HTMLTextAreaElement | null {
  if (!ref) return null;
  const inner = (ref as unknown as { resizableTextArea?: { textArea?: HTMLTextAreaElement } })
    .resizableTextArea?.textArea;
  return inner ?? ref;
}

/**
 * Ô soạn tin. Giữ `draft` ở đây (không ở MessagePane): mỗi phần chỉ render lại ô soạn, không
 * render lại cả danh sách tin nhắn. <Activity> vẫn giữ nháp khi chuyển channel.
 */
export function MessageComposer({
  channelId,
  channelName,
  replyTo,
  onCancelReply,
  onSend,
  textareaRef,
}: {
  channelId: string;
  channelName: string;
  /** TG.1: tin đang được trả lời; null = tin thường. */
  replyTo: { id: string; authorName: string; content: string; deleted: boolean } | null;
  onCancelReply: () => void;
  onSend: (content: string, nonce: string, replyToId?: string, attachmentIds?: string[]) => void;
  /** Ô nhập để empty state bấm "Gửi tin đầu tiên" đưa con trỏ về đây (TF.9). */
  textareaRef?: RefObject<HTMLTextAreaElement | null>;
}) {
  const realtime = useRealtime();
  const { ability, ready } = useServerAbility();
  const canSend = ability.can('create', 'Message');
  const [draft, setDraft] = useState('');
  const uploads = useAttachmentDrafts(channelId);
  const inputRef = useRef<HTMLInputElement>(null);
  const ta = useTranslations('attachments');
  const errorMessage = useErrorMessage();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [suggestionIndex, setSuggestionIndex] = useState(0);
  const t = useTranslations('messages');
  const te = useTranslations('emoji');
  const label = t('composerLabel', { channel: channelName });
  const nearLimit = draft.length >= 3600;
  const replyToId = replyTo?.id ?? null;

  // Chọn trả lời: đưa con trỏ vào ô soạn để gõ ngay (đổi tin đích thì focus lại).
  useEffect(() => {
    if (replyToId) textareaRef?.current?.focus();
  }, [replyToId, textareaRef]);

  // Gợi ý :ten: (TG.23): fragment từ draft; dataset tải động lần đầu gõ ':'.
  const fragment = extractFragment(draft);
  const suggestions = useEmojiSuggestions(fragment);

  function insertAtCursor(insert: string) {
    const el = resolveTextArea(textareaRef?.current ?? null);
    const start = el?.selectionStart ?? draft.length;
    const end = el?.selectionEnd ?? draft.length;
    const next = draft.slice(0, start) + insert + draft.slice(end);
    setDraft(next);
    // Đưa con trỏ tới sau phần chèn (requestAnimationFrame: chờ render xong mới set).
    requestAnimationFrame(() => {
      el?.focus();
      const pos = start + insert.length;
      el?.setSelectionRange(pos, pos);
    });
  }

  function acceptSuggestion(index: number) {
    const entry = suggestions[index];
    if (!entry || fragment === null) return;
    // Thay `:fragment` bằng `:shortcode:` — render qua map markdown (TG.4).
    const next = `${draft.slice(0, draft.length - fragment.length - 1)}:${entry.shortcode}:`;
    setDraft(next);
    setSuggestionIndex(0);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    // Gợi ý đang mở: mũi tên/Enter/Tab/Esc điều khiển danh sách trước khi gửi tin.
    if (suggestions.length > 0 && fragment !== null) {
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setSuggestionIndex((index) => (index + 1) % suggestions.length);
        return;
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        setSuggestionIndex((index) => (index - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        event.preventDefault();
        acceptSuggestion(suggestionIndex);
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        setDraft(draft.slice(0, draft.length - fragment.length - 1));
        setSuggestionIndex(0);
        return;
      }
    }
    if (!ready || !canSend || uploads.busy) return;
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) {
      return; // Shift+Enter xuống dòng; đang gõ dấu (IME) thì Enter là chọn chữ, không phải gửi.
    }
    event.preventDefault();
    // nonce sinh MỘT lần cho mỗi tin; gửi lại dùng đúng nonce này (server chặn trùng).
    const parsed = createMessageSchema.safeParse({
      content: draft,
      nonce: crypto.randomUUID(),
      ...(uploads.ids.length ? { attachmentIds: uploads.ids } : {}),
      ...(replyTo ? { replyToId: replyTo.id } : {}),
    });
    if (!parsed.success) {
      return; // rỗng hoặc toàn khoảng trắng: không gửi
    }
    onSend(
      parsed.data.content,
      parsed.data.nonce,
      parsed.data.replyToId,
      parsed.data.attachmentIds,
    );
    uploads.sent();
    setDraft('');
    setPickerOpen(false);
  }

  return (
    <div
      className="shrink-0 px-4 pb-4"
      role="group"
      aria-label={label}
      onPaste={(event) => {
        const pasted = Array.from(event.clipboardData.files);
        if (pasted.length && ready && canSend) {
          event.preventDefault();
          uploads.add(pasted);
        }
      }}
    >
      {canSend ? (
        <>
          <p className="mb-1 text-xs text-muted-foreground">{ta('files')}</p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="sr-only"
            aria-label={ta('choose')}
            data-testid="attachment-input"
            disabled={!ready || uploads.files.length >= 5}
            onChange={(event) => {
              uploads.add(Array.from(event.target.files ?? []));
              event.target.value = '';
            }}
          />
          {uploads.files.length > 0 && (
            <ul aria-label={ta('files')} className="mb-2 flex flex-wrap gap-2">
              {uploads.files.map((file) => (
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
                    onClick={() => uploads.remove(file.key)}
                    aria-label={ta('cancel', { name: file.file.name })}
                    className="underline"
                  >
                    {ta('remove')}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {replyTo && (
            <div
              data-testid="reply-bar"
              className="mb-1 flex items-center gap-2 rounded-lg border-l-2 border-primary bg-muted px-3 py-1.5 text-xs"
            >
              <div className="min-w-0 flex-1">
                <p className="font-medium">{t('replyingTo', { author: replyTo.authorName })}</p>
                <p className="truncate text-muted-foreground">
                  {replyTo.deleted ? t('replyDeleted') : replyTo.content}
                </p>
              </div>
              <button
                type="button"
                aria-label={t('cancelReply')}
                onClick={onCancelReply}
                className="shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            </div>
          )}
          {pickerOpen && (
            <div className="mb-2 flex justify-start">
              <EmojiPicker
                onPick={(unicode) => {
                  insertAtCursor(unicode);
                  setPickerOpen(false);
                }}
              />
            </div>
          )}
          {suggestions.length > 0 && fragment !== null && (
            <ul
              role="listbox"
              aria-label={te('suggestionsLabel')}
              className="mb-1 flex flex-col gap-0.5 rounded-lg border bg-popover p-1 shadow-sm"
              data-testid="emoji-suggestions"
            >
              {suggestions.map((entry, index) => (
                <li key={entry.shortcode}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={index === suggestionIndex}
                    onClick={() => acceptSuggestion(index)}
                    className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-sm transition-colors ${
                      index === suggestionIndex ? 'bg-accent' : 'hover:bg-accent/60'
                    }`}
                  >
                    <span className="text-lg leading-none">{entry.unicode}</span>
                    <code className="text-xs text-muted-foreground">:{entry.shortcode}:</code>
                    <span className="truncate text-xs text-muted-foreground">
                      {entry.keywords[0]}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex items-end gap-1">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={!ready || uploads.files.length >= 5}
              aria-label={ta('choose')}
              className="shrink-0 rounded-md p-2 text-muted-foreground hover:bg-accent disabled:opacity-50"
            >
              <Paperclip className="size-5" />
            </button>
            <PingTextArea
              ref={textareaRef}
              disabled={!ready}
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                setSuggestionIndex(0);
                if (ready && event.target.value.trim()) realtime.type(channelId);
              }}
              onKeyDown={onKeyDown}
              onDragOver={(event) => {
                if (ready && canSend) event.preventDefault();
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (ready && canSend) uploads.add(Array.from(event.dataTransfer.files));
              }}
              autoSize={{ minRows: 1, maxRows: 8 }}
              maxLength={4000}
              placeholder={label}
              aria-label={label}
              data-testid="message-composer"
            />
            <button
              type="button"
              aria-label={te('open')}
              aria-expanded={pickerOpen}
              data-testid="emoji-button"
              onClick={() => setPickerOpen((open) => !open)}
              className="shrink-0 rounded-md p-2 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Smile className="size-5" />
            </button>
          </div>
          {nearLimit ? (
            <p role="status" className="mt-1 text-xs text-muted-foreground">
              {draft.length}/4000
            </p>
          ) : null}
        </>
      ) : (
        <p role="status" className="rounded-lg bg-muted p-3 text-sm text-muted-foreground">
          {t('cannotSend')}
        </p>
      )}
    </div>
  );
}
