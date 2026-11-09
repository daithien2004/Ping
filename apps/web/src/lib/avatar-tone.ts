export const AVATAR_TONES = 4;

/** Một trong 4 sắc theo tên (FNV-1a, phân bố đều), ổn định giữa các lần render. Chỉ skin Pop dùng. */
export function avatarTone(name: string): number {
  let hash = 2166136261;
  for (const char of name) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash % AVATAR_TONES;
}
