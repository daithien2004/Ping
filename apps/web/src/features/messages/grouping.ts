import type { ClientMessage } from './message-cache';

/** Cùng tác giả trong khoảng này thì gộp thành một khối (đề xuất D3, ui-system §7). */
export const GROUP_WINDOW_MS = 5 * 60 * 1000;

export interface MessageRow {
  message: ClientMessage;
  /** Tin đầu ngày (hoặc tin đầu danh sách) — chèn vạch ngày phía trên. */
  showDate: boolean;
  /** Thuộc khối của tin trước: ẩn tên/giờ, siết khoảng cách trên. */
  grouped: boolean;
}

const dayOf = (iso: string) => new Date(iso).toDateString();

/**
 * Tính cờ hiển thị cho từng tin. Một khối bị cắt (tin sau hiện lại tên + giờ) khi: tác giả đổi,
 * cách nhau quá 5 phút, là tin trả lời (khối trích dẫn cần chỗ đứng), hoặc sang ngày khác.
 * Vạch ngày chỉ phụ thuộc ngày của tin, không phụ thuộc việc tin đó có mở khối hay không.
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
