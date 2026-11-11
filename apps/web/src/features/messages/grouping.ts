import type { ClientMessage } from './message-cache';

export const GROUP_WINDOW_MS = 5 * 60 * 1000;

export interface MessageRow {
  message: ClientMessage;
  showDate: boolean;
  grouped: boolean;
}

const dayOf = (iso: string) => new Date(iso).toDateString();

/**
 * Gắn cờ mỗi tin nhắn để giao diện biết có cần hiện ngày mới và có thể gom với tin trước không.
 * Ví dụ hai tin cùng tác giả, cùng ngày, cách nhau dưới 5 phút:
 * input:  [m1(author: 'u1', 10:00), m2(author: 'u1', 10:02)]
 * output: [m1(showDate: true, grouped: false), m2(showDate: false, grouped: true)]
 */
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
