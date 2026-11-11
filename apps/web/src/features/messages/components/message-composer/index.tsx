'use client';

import { Limits } from '@ping/shared';
import { useEffect, useState, type KeyboardEvent, type RefObject } from 'react';
import { useTranslations } from 'use-intl';
import { Plus } from 'lucide-react';
import { PingTextArea, type PingTextAreaRef } from '@/components/ui/ping-textarea';
import { useRealtime } from '@/features/realtime/context';
import { useServerAbility } from '@/features/permissions/context';
import { AttachmentTray } from './attachment-tray';
import { ComposerActions, type Picker } from './composer-actions';
import { ComposerIconButton } from './composer-icon-button';
import { isImeKey, isSubmitKey } from './composer-keys';
import { EmojiPanel } from './emoji-panel';
import { EmojiSuggestionList } from './emoji-suggestion-list';
import { textMessage, type OutgoingMessage } from './outgoing-message';
import { ReplyBar, type ReplyTarget } from './reply-bar';
import { StickerPanel } from './sticker-panel';
import { useAttachmentInput } from './use-attachment-input';
import { useEmojiAutocomplete } from './use-emoji-autocomplete';
import { useInsertAtCursor } from './use-insert-at-cursor';

const MAX_LENGTH = Limits.MESSAGE_CONTENT_MAX;
const NEAR_LIMIT = Math.floor(MAX_LENGTH * 0.9);

export function MessageComposer({
  serverId,
  channelId,
  channelName,
  replyTo,
  onCancelReply,
  onSend,
  textareaRef,
}: {
  serverId: string | null;
  channelId: string;
  channelName: string;
  replyTo: ReplyTarget | null;
  onCancelReply: () => void;
  onSend: (message: OutgoingMessage) => void;
  textareaRef?: RefObject<PingTextAreaRef | null>;
}) {
  const realtime = useRealtime();
  const { ability, ready } = useServerAbility();
  const canSend = ability.can('create', 'Message');
  const interactive = ready && canSend;

  const [draft, setDraft] = useState('');
  const [picker, setPicker] = useState<Picker>(null);
  const togglePicker = (next: Exclude<Picker, null>) =>
    setPicker((current) => (current === next ? null : next));
  const autocomplete = useEmojiAutocomplete(draft, setDraft, serverId ?? undefined);
  const attachments = useAttachmentInput(channelId, interactive);
  const { uploads } = attachments;

  const ta = useTranslations('attachments');
  const t = useTranslations('messages');
  const isDm = serverId === null;
  const label = isDm
    ? t('dmComposerLabel', { name: channelName })
    : t('composerLabel', { channel: channelName });
  const nearLimit = draft.length >= NEAR_LIMIT;

  const replyToId = replyTo?.id ?? null;
  useEffect(() => {
    if (replyToId) textareaRef?.current?.focus();
  }, [replyToId, textareaRef]);

  const insertAtCursor = useInsertAtCursor(textareaRef, draft, setDraft);
  const hasContent = draft.trim().length > 0 || uploads.ids.length > 0;

  function submit() {
    if (!interactive || uploads.busy) return;
    const message = textMessage(draft, uploads.ids, replyTo?.id);
    if (!message) return;
    onSend(message);
    uploads.sent();
    setDraft('');
    setPicker((current) => (current === 'emoji' ? null : current));
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (isImeKey(event.nativeEvent)) return;
    if (autocomplete.handleKey(event)) return;
    if (!interactive || uploads.busy) return;
    if (isSubmitKey(event)) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <div
      className="shrink-0 px-2 pb-2"
      role="group"
      aria-label={label}
      onPaste={attachments.onPaste}
    >
      {canSend ? (
        <>
          <input
            {...attachments.inputProps}
            className="sr-only"
            aria-label={ta('choose')}
            data-testid="attachment-input"
          />
          <AttachmentTray files={uploads.files} onRemove={uploads.remove} />
          {replyTo && <ReplyBar replyTo={replyTo} onCancel={onCancelReply} />}
          {picker === 'emoji' && (
            <EmojiPanel
              serverId={serverId ?? undefined}
              onInsert={(text) => {
                insertAtCursor(text);
                setPicker(null);
              }}
            />
          )}
          {!isDm && picker === 'sticker' && (
            <StickerPanel
              serverId={serverId ?? ''}
              onSticker={(sticker) => {
                setPicker(null);
                onSend({ kind: 'sticker', sticker, replyToId: replyTo?.id });
              }}
              onGif={(gif) => {
                setPicker(null);
                onSend({ kind: 'gif', gif, replyToId: replyTo?.id });
              }}
            />
          )}
          {autocomplete.open && (
            <EmojiSuggestionList
              suggestions={autocomplete.suggestions}
              activeIndex={autocomplete.index}
              onPick={autocomplete.accept}
            />
          )}
          <div
            data-slot="composer"
            className="flex items-end gap-1 rounded-md border border-border bg-card p-2.5 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-ring"
          >
            <ComposerIconButton
              variant="bordered"
              onClick={attachments.openPicker}
              disabled={attachments.disabled}
              aria-label={ta('choose')}
            >
              <Plus className="size-4" />
            </ComposerIconButton>
            <PingTextArea
              ref={textareaRef}
              variant="borderless"
              disabled={!interactive}
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                autocomplete.reset();
                if (interactive && event.target.value.trim()) realtime.type(channelId);
              }}
              onKeyDown={onKeyDown}
              onDragOver={attachments.onDragOver}
              onDrop={attachments.onDrop}
              autoSize={{ minRows: 1, maxRows: 8 }}
              maxLength={MAX_LENGTH}
              placeholder={label}
              aria-label={label}
              data-testid="message-composer"
            />
            <ComposerActions
              picker={picker}
              onTogglePicker={togglePicker}
              showSticker={!isDm}
              showSend={hasContent}
              sendDisabled={!interactive || uploads.busy}
              onSubmit={submit}
            />
          </div>
          {nearLimit ? (
            <p role="status" className="mt-1 text-xs text-muted-foreground">
              {draft.length}/{MAX_LENGTH}
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
