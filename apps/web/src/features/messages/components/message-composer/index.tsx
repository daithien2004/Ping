'use client';

import { Limits } from '@ping/shared';
import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'use-intl';
import { Plus } from 'lucide-react';
import { PingTextArea, type PingTextAreaRef } from '@/components/ui/ping-textarea';
import { useRealtime } from '@/features/realtime/context';
import { useServerAbility } from '@/features/permissions/context';
import { preloadEmojiPicker } from '@/features/emoji/preload';
import { prefetchEmojis } from '@/features/emojis/hooks';
import { preloadStickerPicker } from '@/features/stickers/preload';
import { prefetchStickers } from '@/features/stickers/hooks';
import { isDmScope, serverIdOf, type ChannelScope } from '../../channel-scope';
import { AttachmentTray } from './attachment-tray';
import { ComposerActions, type Picker } from './composer-actions';
import { ComposerIconButton } from './composer-icon-button';
import { isImeKey, isSubmitKey } from './composer-keys';
import { EmojiPanel } from './emoji-panel';
import { EmojiSuggestionList } from './emoji-suggestion-list';
import { gifMessage, stickerMessage, textMessage, type OutgoingMessage } from './outgoing-message';
import { ReplyBar, type ReplyTarget } from './reply-bar';
import { StickerPanel } from './sticker-panel';
import { useAttachmentInput } from './use-attachment-input';
import { useEmojiAutocomplete } from './use-emoji-autocomplete';
import { useInsertAtCursor } from './use-insert-at-cursor';

const MAX_LENGTH = Limits.MESSAGE_CONTENT_MAX;
const NEAR_LIMIT = Math.floor(MAX_LENGTH * 0.9);

export function MessageComposer({
  scope,
  channelId,
  channelName,
  replyTo,
  onCancelReply,
  onSend,
  textareaRef,
  focusRequest = 0,
}: {
  scope: ChannelScope;
  channelId: string;
  channelName: string;
  replyTo: ReplyTarget | null;
  onCancelReply: () => void;
  onSend: (message: OutgoingMessage) => void;
  textareaRef?: RefObject<PingTextAreaRef | null>;
  focusRequest?: number;
}) {
  const realtime = useRealtime();
  const queryClient = useQueryClient();
  const { ability, ready } = useServerAbility();
  const canSend = ability.can('create', 'Message');
  const interactive = ready && canSend;

  const [draft, setDraft] = useState('');
  const [picker, setPicker] = useState<Picker>(null);
  const serverId = serverIdOf(scope) ?? undefined;
  const autocomplete = useEmojiAutocomplete(draft, setDraft, serverId);
  const attachments = useAttachmentInput(channelId, interactive);
  const { uploads } = attachments;

  const ta = useTranslations('attachments');
  const t = useTranslations('messages');
  const isDm = isDmScope(scope);
  const label = isDm
    ? t('dmComposerLabel', { name: channelName })
    : t('composerLabel', { channel: channelName });
  const nearLimit = draft.length >= NEAR_LIMIT;

  const replyToId = replyTo?.id;
  const handledReplyFocus = useRef<string | undefined>(undefined);
  const handledFocusRequest = useRef(focusRequest);
  useEffect(() => {
    if (!replyToId) {
      handledReplyFocus.current = undefined;
      return;
    }
    if (!interactive || handledReplyFocus.current === replyToId) return;
    handledReplyFocus.current = replyToId;
    textareaRef?.current?.focus();
  }, [replyToId, interactive, textareaRef]);

  useEffect(() => {
    if (focusRequest === handledFocusRequest.current || !interactive) return;
    handledFocusRequest.current = focusRequest;
    textareaRef?.current?.focus();
  }, [focusRequest, interactive, textareaRef]);

  useEffect(() => {
    const warm = () => {
      void preloadEmojiPicker();
      if (serverId) void prefetchEmojis(queryClient, serverId);
      if (isDm) return;
      void preloadStickerPicker();
      if (serverId) void prefetchStickers(queryClient, serverId);
    };
    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(warm, { timeout: 2000 });
      return () => window.cancelIdleCallback(handle);
    }
    const timer = window.setTimeout(warm, 1000);
    return () => window.clearTimeout(timer);
  }, [isDm, serverId, queryClient]);

  const insertAtCursor = useInsertAtCursor(textareaRef, draft, setDraft);
  const hasContent = draft.trim().length > 0 || uploads.attachments.length > 0;

  function submit() {
    if (!interactive || uploads.busy) return;
    const message = textMessage(draft, uploads.attachments, replyToId);
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
      className="shrink-0 px-4 pb-2"
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
          {autocomplete.open && (
            <EmojiSuggestionList
              suggestions={autocomplete.suggestions}
              activeIndex={autocomplete.index}
              onPick={autocomplete.accept}
            />
          )}
          <div
            data-slot="composer"
            className="flex items-end gap-1.5 rounded-lg bg-muted px-2 py-1.5"
          >
            <ComposerIconButton
              variant="bordered"
              onClick={attachments.openPicker}
              disabled={attachments.disabled}
              aria-label={ta('choose')}
            >
              <Plus className="size-[18px]" />
            </ComposerIconButton>
            <PingTextArea
              ref={textareaRef}
              variant="borderless"
              className="min-h-8 flex-1 min-w-0"
              style={{ paddingBlock: 5 }}
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
              onPickerChange={setPicker}
              emojiPicker={() => (
                <EmojiPanel
                  serverId={serverId}
                  onInsert={(text) => {
                    insertAtCursor(text);
                    setPicker(null);
                  }}
                />
              )}
              stickerPicker={() =>
                scope.kind === 'server' ? (
                  <StickerPanel
                    serverId={scope.serverId}
                    onSticker={(sticker) => {
                      setPicker(null);
                      onSend(stickerMessage(sticker, replyToId));
                    }}
                    onGif={(gif) => {
                      setPicker(null);
                      onSend(gifMessage(gif, replyToId));
                    }}
                  />
                ) : null
              }
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
