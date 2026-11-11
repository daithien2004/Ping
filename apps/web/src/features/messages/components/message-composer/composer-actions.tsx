'use client';

import { Send, Smile, Sticker } from 'lucide-react';
import { useTranslations } from 'use-intl';
import { ComposerIconButton } from './composer-icon-button';

export type Picker = 'emoji' | 'sticker' | null;

export function ComposerActions({
  picker,
  onTogglePicker,
  showSticker,
  showSend,
  sendDisabled,
  onSubmit,
}: {
  picker: Picker;
  onTogglePicker: (next: Exclude<Picker, null>) => void;
  showSticker: boolean;
  showSend: boolean;
  sendDisabled: boolean;
  onSubmit: () => void;
}) {
  const t = useTranslations('messages');
  const te = useTranslations('emoji');
  const ts = useTranslations('stickers');
  return (
    <>
      <ComposerIconButton
        aria-label={te('open')}
        aria-expanded={picker === 'emoji'}
        data-testid="emoji-button"
        onClick={() => onTogglePicker('emoji')}
      >
        <Smile className="size-5" />
      </ComposerIconButton>
      {showSticker && (
        <ComposerIconButton
          aria-label={ts('open')}
          aria-expanded={picker === 'sticker'}
          data-testid="sticker-button"
          onClick={() => onTogglePicker('sticker')}
        >
          <Sticker className="size-5" />
        </ComposerIconButton>
      )}
      {showSend && (
        <ComposerIconButton
          variant="primary"
          onClick={onSubmit}
          disabled={sendDisabled}
          aria-label={t('send')}
          data-testid="send-button"
          data-slot="send"
        >
          <Send className="size-5" />
        </ComposerIconButton>
      )}
    </>
  );
}
