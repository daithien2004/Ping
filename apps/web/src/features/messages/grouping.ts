import type { ClientMessage } from './message-cache';

export const GROUP_WINDOW_MS = 5 * 60 * 1000;

export interface MessageRow {
  message: ClientMessage;
  showDate: boolean;
  grouped: boolean;
}

const dayOf = (iso: string) => new Date(iso).toDateString();

export function groupMessages(messages: ClientMessage[], windowMs = GROUP_WINDOW_MS): MessageRow[] {
  return messages.map((message, index) => {
    const previous = messages[index - 1];
    const at = new Date(message.createdAt).getTime();
    const showDate = !previous || dayOf(previous.createdAt) !== dayOf(message.createdAt);
    const grouped =
      previous !== undefined &&
      !showDate &&
      message.replyTo === null &&
      previous.authorId === message.authorId &&
      at - new Date(previous.createdAt).getTime() <= windowMs;
    return { message, showDate, grouped };
  });
}
