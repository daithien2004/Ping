import { customEmojiToken, type CustomEmojiDto } from '@ping/shared';
import { foldVi } from '@/lib/fold-vi';

/** Regex tách id UUID khỏi token đầy đủ `:ten:<id>` (không dùng bản /g của shared để tránh lastIndex). */
const FULL_TOKEN_PATTERN =
  /^:([a-z0-9_]{2,32}):([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

export function emojiInsertToken(emoji: Pick<CustomEmojiDto, 'name' | 'id'>): string {
  return customEmojiToken(emoji.name, emoji.id);
}

export function customEmojiIdFromToken(token: string): string | null {
  return FULL_TOKEN_PATTERN.exec(token)?.[2] ?? null;
}

export function emojiMatchesSearch(emoji: CustomEmojiDto, query: string): boolean {
  const q = foldVi(query.trim().toLowerCase()).replace(/\s+/g, '_');
  if (q === '') return true;
  return foldVi(emoji.name.toLowerCase()).includes(q);
}

export function suggestEmojiName(filename: string): string {
  const cleaned = foldVi(filename.replace(/\.[^.]+$/, '').toLowerCase())
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^[^a-z0-9]+/, '')
    .replace(/_+$/, '')
    .slice(0, 32);
  return cleaned.replace(/_+$/, '');
}
