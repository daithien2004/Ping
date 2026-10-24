import { Limits } from '@ping/shared';

/**
 * Tách token mention khỏi văn bản tin nhắn (T4.1, ADR-0043) — hàm thuần, không đụng DB.
 *
 * Token hợp lệ: `@` đứng sau ranh giới từ (không phải một phần của email `a@b` hay `@@`),
 * theo sau là chuỗi `[A-Za-z0-9_.-]` từ 3 đến 32 ký tự — đúng charset username lúc đăng ký,
 * và kết thúc trọn vẹn (token dài hơn 32 ký tự không match một phần). `everyone` là từ khoá
 * riêng, các token còn lại được giải nghĩa phía server (thành viên theo username, hoặc role
 * theo tên). Tối đa `Limits.MENTIONS_PER_MESSAGE` mention khác nhau: phần vượt bị bỏ qua.
 */
const MENTION_TOKEN = /(?<![A-Za-z0-9_@])@([A-Za-z0-9_.-]{3,32})(?![A-Za-z0-9_.-])/g;

export interface MentionTokens {
  /** Có ít nhất một `@everyone` hợp lệ. */
  everyone: boolean;
  /** Token cần giải nghĩa (username hoặc tên role), duy nhất, theo thứ tự xuất hiện. */
  names: string[];
}

export function extractMentionTokens(
  content: string,
  limit: number = Limits.MENTIONS_PER_MESSAGE,
): MentionTokens {
  const seen = new Set<string>();
  const names: string[] = [];
  let everyone = false;

  for (const match of content.matchAll(MENTION_TOKEN)) {
    const token = match[1];
    if (token === undefined) continue;
    if (token === 'everyone') {
      if (!everyone) {
        everyone = true;
        seen.add('everyone');
      }
      continue;
    }
    if (seen.has(token)) continue;
    seen.add(token);
    names.push(token);
    if (seen.size >= limit) break; // tính cả `everyone` như một mention
  }

  return { everyone, names };
}
