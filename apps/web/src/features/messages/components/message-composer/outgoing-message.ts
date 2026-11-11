import type { GifPayload, StickerDto } from '@ping/shared';
import { stickerPreviewOf } from '@/features/stickers/hooks';
import type { SendMessageVariables } from '../../hooks';

export type OutgoingMessage = { replyToId?: string } & (
  | { kind: 'text'; content: string; attachmentIds?: string[] }
  | { kind: 'sticker'; sticker: StickerDto }
  | { kind: 'gif'; gif: GifPayload }
);

export function textMessage(
  draft: string,
  attachmentIds: string[],
  replyToId?: string,
): OutgoingMessage | null {
  const content = draft.trim();
  if (!content && !attachmentIds.length) return null;
  return {
    kind: 'text',
    content,
    ...(attachmentIds.length ? { attachmentIds } : {}),
    ...(replyToId ? { replyToId } : {}),
  };
}

export function toSendVariables(message: OutgoingMessage, nonce: string): SendMessageVariables {
  const reply = message.replyToId ? { replyToId: message.replyToId } : {};
  switch (message.kind) {
    case 'text':
      return {
        input: {
          content: message.content,
          nonce,
          ...reply,
          ...(message.attachmentIds?.length ? { attachmentIds: message.attachmentIds } : {}),
        },
      };
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
