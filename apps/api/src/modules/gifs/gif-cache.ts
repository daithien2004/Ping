import type { GifDto } from '@ping/shared';

const TTL_MS = 5 * 60_000;
const MAX_ENTRIES = 200;
const MAX_KEY_LENGTH = 512;

interface Entry {
  gifs: GifDto[];
  expiresAt: number;
}

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
