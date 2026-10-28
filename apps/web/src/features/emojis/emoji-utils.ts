import { customEmojiToken, type CustomEmojiDto } from '@ping/shared';
import { foldVi } from '@/features/emoji/fold-vi';

/** Regex tách id UUID khỏi token đầy đủ `:ten:<id>` (không dùng bản /g của shared để tránh lastIndex). */
const FULL_TOKEN_PATTERN =
  /^:([a-z0-9_]{2,32}):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

/** Token `:ten:<id>` chèn vào nội dung tin — id UUID là nguồn sự thật (ADR-0068). */
export function emojiInsertToken(emoji: Pick<CustomEmojiDto, 'name' | 'id'>): string {
  return customEmojiToken(emoji.name, emoji.id);
}

/** Lấy id từ token `:ten:<id>` (picker server → reaction `c:<id>`); không khớp → null. */
export function customEmojiIdFromToken(token: string): string | null {
  return FULL_TOKEN_PATTERN.exec(token)?.[2] ?? null;
}

/** Tìm theo tên, không dấu ("khoc" lẫn "khóc" đều trúng "khoc") — tái dùng foldVi (TG.22). */
export function emojiMatchesSearch(emoji: CustomEmojiDto, query: string): boolean {
  // Tên emoji luôn [a-z0-9_] — khoảng trắng trong truy vấn coi như dấu gạch dưới.
  const q = foldVi(query.trim().toLowerCase()).replace(/\s+/g, '_');
  if (q === '') return true;
  return foldVi(emoji.name.toLowerCase()).includes(q);
}

/** Chuẩn hóa tên tệp thành tên emoji hợp lệ ([a-z0-9_], trần 32) — người dùng vẫn sửa được. */
export function suggestEmojiName(filename: string): string {
  const cleaned = foldVi(filename.replace(/\.[^.]+$/, '').toLowerCase())
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^[^a-z0-9]+/, '')
    .replace(/_+$/, '')
    .slice(0, 32);
  return cleaned.replace(/_+$/, '');
}
