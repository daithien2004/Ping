'use client';

import { Send, Smile, Sticker } from 'lucide-react';
import type { ReactNode } from 'react';
import { useTranslations } from 'use-intl';
import { PingPopover } from '@/components/ui/ping-popover';
import { preloadEmojiPicker } from '@/features/emoji/preload';
import { preloadStickerPicker } from '@/features/stickers/preload';
import { ComposerIconButton } from './composer-icon-button';

export type Picker = 'emoji' | 'sticker' | null;

/** Panel picker đã có padding riêng — bỏ padding mặc định của popover để picker lấp đầy khung. */
const PICKER_POPOVER_STYLES = {
  container: { padding: 0 },
  content: { padding: 0 },
};

/** Nội dung popover của từng nút — nút là anchor, panel không chiếm chỗ trong khung soạn. */
type PanelRenderer = () => ReactNode;

export function ComposerActions({
  picker,
  onPickerChange,
  emojiPicker,
  stickerPicker,
  showSticker,
  showSend,
  sendDisabled,
  onSubmit,
}: {
  picker: Picker;
  onPickerChange: (next: Picker) => void;
  /** Nội dung popover của từng nút — nút là anchor, panel không chiếm chỗ trong khung soạn. */
  emojiPicker: PanelRenderer;
  stickerPicker: PanelRenderer;
  showSticker: boolean;
  showSend: boolean;
  sendDisabled: boolean;
  onSubmit: () => void;
}) {
  const t = useTranslations('messages');
  const te = useTranslations('emoji');
  const ts = useTranslations('stickers');

  // Cụm icon sát nhau ở mép phải như thanh soạn tin Discord; mỗi nút vẫn là một ô 32 px.
  return (
    <div className="flex items-end gap-0.5">
      <PingPopover
        trigger="click"
        placement="topRight"
        open={picker === 'emoji'}
        onOpenChange={(open) => onPickerChange(open ? 'emoji' : null)}
        scrim
        destroyOnHidden
        arrow={false}
        styles={PICKER_POPOVER_STYLES}
        content={emojiPicker()}
      >
        <ComposerIconButton
          aria-label={te('open')}
          aria-expanded={picker === 'emoji'}
          data-testid="emoji-button"
          onPointerEnter={() => void preloadEmojiPicker()}
          onFocus={() => void preloadEmojiPicker()}
        >
          <Smile className="size-[18px]" />
        </ComposerIconButton>
      </PingPopover>
      {showSticker && (
        <PingPopover
          trigger="click"
          placement="topRight"
          open={picker === 'sticker'}
          onOpenChange={(open) => onPickerChange(open ? 'sticker' : null)}
          scrim
          destroyOnHidden
          arrow={false}
          styles={PICKER_POPOVER_STYLES}
          content={stickerPicker()}
        >
          <ComposerIconButton
            aria-label={ts('open')}
            aria-expanded={picker === 'sticker'}
            data-testid="sticker-button"
            onPointerEnter={() => void preloadStickerPicker()}
            onFocus={() => void preloadStickerPicker()}
          >
            <Sticker className="size-[18px]" />
          </ComposerIconButton>
        </PingPopover>
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
          <Send className="size-[18px]" />
        </ComposerIconButton>
      )}
    </div>
  );
}
