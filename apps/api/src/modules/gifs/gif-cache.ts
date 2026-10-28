import type { GifDto } from '@ping/shared';

/** TTL 5 phút (ADR-0069 mục 3): kết quả công khai của nhà cung cấp, không dữ liệu người dùng. */
const TTL_MS = 5 * 60_000;
/** Trần số entry; hết chỗ thì xóa entry cũ nhất (FIFO theo thứ tự chèn của Map). */
const MAX_ENTRIES = 200;
/** Chống khóa phình vô hạn nếu callers ghép dữ liệu lạ vào key. */
const MAX_KEY_LENGTH = 512;

interface Entry {
  gifs: GifDto[];
  expiresAt: number;
}

/**
 * Cache in-memory TTL 5 phút cho kết quả search/trending (ADR-0069 mục 3) — CHỈ giữ dữ liệu
 * công khai, không bao giờ dữ liệu người dùng. Một instance của tiến trình, một Map duy nhất;
 * key đã ghép loại + q + limit ở tầng service, quá dài thì trim.
 */
export class GifCache {
  private readonly entries = new Map<string, Entry>();

  constructor(
    private readonly ttlMs = TTL_MS,
    private readonly maxEntries = MAX_ENTRIES,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: string): GifDto[] | undefined {
    const normalized = this.trimKey(key);
    const entry = this.entries.get(normalized);
    if (!entry) return undefined;
    if (entry.expiresAt <= this.now()) {
      this.entries.delete(normalized);
      return undefined;
    }
    return entry.gifs;
  }

  set(key: string, gifs: GifDto[]): void {
    const normalized = this.trimKey(key);
    // Hết chỗ: xóa entry cũ nhất trước (Map giữ thứ tự chèn — key đầu tiên là cũ nhất).
    while (this.entries.size >= this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
    this.entries.set(normalized, { gifs, expiresAt: this.now() + this.ttlMs });
  }

  private trimKey(key: string): string {
    return key.length > MAX_KEY_LENGTH ? key.slice(0, MAX_KEY_LENGTH) : key;
  }
}
