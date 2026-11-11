import type { SendMessageVariables } from '../../hooks';
import type { ClientMessage } from '../../message-cache';

export interface RetryPlan {
  kind: 'text' | 'sticker' | 'gif';
  variables: SendMessageVariables;
}

export function retryVariables(message: ClientMessage): RetryPlan | null {
  const { nonce } = message;
  if (!nonce) return null;
  const reply = message.replyTo?.id ? { replyToId: message.replyTo.id } : {};

  if (message.kind === 'sticker') {
    return {
      kind: 'sticker',
      variables: {
        input: { content: '', nonce, ...reply, stickerId: message.sticker?.id },
        preview: { sticker: message.sticker ?? null },
      },
    };
  }

  if (message.kind === 'gif') {
    if (!message.gif || !message.gifId) return null;
    const { url, width, height } = message.gif;
    return {
      kind: 'gif',
      variables: {
        input: { content: '', nonce, ...reply, gif: { id: message.gifId, url, width, height } },
        preview: { gif: message.gif },
      },
    };
  }

  const attachmentIds = message.pendingAttachmentIds ?? message.attachments?.map((file) => file.id);
  return {
    kind: 'text',
    variables: {
      input: {
        content: message.content,
        nonce,
        ...reply,
        ...(attachmentIds?.length ? { attachmentIds } : {}),
      },
    },
  };
}
