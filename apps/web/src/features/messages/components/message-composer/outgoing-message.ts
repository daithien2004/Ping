import type { AttachmentDto, GifPayload, StickerDto } from '@ping/shared';
import { stickerPreviewOf } from '@/features/stickers/hooks';
import type { SendMessageVariables } from '../../hooks';

export type OutgoingMessage = { replyToId?: string } & (
  | { kind: 'text'; content: string; attachments?: AttachmentDto[] }
  | { kind: 'sticker'; sticker: StickerDto }
  | { kind: 'gif'; gif: GifPayload }
);

/** `attachments` là DTO upload đã `ready` — vừa là id gửi API, vừa là preview cho tin tạm. */
export function textMessage(
  draft: string,
  attachments: AttachmentDto[],
  replyToId?: string,
): OutgoingMessage | null {
  const content = draft.trim();
  if (!content && !attachments.length) return null;
  return {
    kind: 'text',
    content,
    ...(attachments.length ? { attachments } : {}),
    ...(replyToId ? { replyToId } : {}),
  };
}

export const stickerMessage = (sticker: StickerDto, replyToId?: string): OutgoingMessage => ({
  kind: 'sticker',
  sticker,
  ...(replyToId ? { replyToId } : {}),
});

export const gifMessage = (gif: GifPayload, replyToId?: string): OutgoingMessage => ({
  kind: 'gif',
  gif,
  ...(replyToId ? { replyToId } : {}),
});

export function toSendVariables(message: OutgoingMessage, nonce: string): SendMessageVariables {
  const reply = message.replyToId ? { replyToId: message.replyToId } : {};
  switch (message.kind) {
    case 'text': {
      const attachmentIds = message.attachments?.map((file) => file.id);
      return {
        input: {
          content: message.content,
          nonce,
          ...reply,
          ...(attachmentIds?.length ? { attachmentIds } : {}),
        },
        ...(message.attachments?.length ? { preview: { attachments: message.attachments } } : {}),
      };
    }
    case 'sticker':
      return {
        input: { content: '', nonce, stickerId: message.sticker.id, ...reply },
        preview: { sticker: stickerPreviewOf(message.sticker) },
      };
    case 'gif': {
      const { gif } = message;
      return {
        input: { content: '', nonce, gif, ...reply },
        preview: {
          gif: { url: gif.url, width: gif.width, height: gif.height, provider: 'tenor' },
        },
      };
    }
  }
}
