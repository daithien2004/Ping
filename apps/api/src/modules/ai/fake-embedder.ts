import type { Embedder, EmbeddingBatch, EmbeddingRole } from './embedder.port.js';

/**
 * Embedder giả lập cho test/e2e: vector tất định, không tải model, không gọi mạng.
 * Cùng một chuỗi luôn cho cùng vector; chuỗi khác nhau cho vector khác nhau.
 */
export class FakeEmbedder implements Embedder {
  readonly model = 'fake-embedding-v1';

  constructor(readonly dimensions = 16) {}

  async embed(texts: readonly string[], role: EmbeddingRole): Promise<EmbeddingBatch> {
    return {
      model: this.model,
      dimensions: this.dimensions,
      vectors: texts.map((text) => this.vector(`${role}:${text}`)),
    };
  }

  private vector(input: string): number[] {
    const vector = new Array<number>(this.dimensions).fill(0);
    for (let index = 0; index < input.length; index += 1) {
      // FNV-1a rút gọn, đủ tất định và phân tán cho test.
      const bucket = (input.charCodeAt(index) * 31 + index) % this.dimensions;
      vector[bucket] = (vector[bucket] ?? 0) + 1;
    }
    const norm = Math.hypot(...vector) || 1;
    return vector.map((value) => value / norm);
  }
}
