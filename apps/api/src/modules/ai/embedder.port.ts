export type EmbeddingRole = 'query' | 'passage';

export interface EmbeddingBatch {
  model: string;
  dimensions: number;
  /** Một vector mỗi input, đúng thứ tự. */
  vectors: number[][];
}

export interface Embedder {
  readonly model: string;
  embed(texts: readonly string[], role: EmbeddingRole): Promise<EmbeddingBatch>;
}
