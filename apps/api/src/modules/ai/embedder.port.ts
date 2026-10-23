/**
 * Cổng (port) sinh vector embedding. Logic RAG/indexer chỉ phụ thuộc interface này,
 * không import trực tiếp thư viện ONNX hay nhà cung cấp nào (ADR-0046).
 */
export type EmbeddingRole = 'query' | 'passage';

export interface EmbeddingBatch {
  /** Tên model đã dùng, lưu kèm vector để biết khi nào phải embed lại. */
  model: string;
  /** Số chiều của vector. */
  dimensions: number;
  /** Một vector cho mỗi input, đúng thứ tự input. */
  vectors: number[][];
}

export interface Embedder {
  readonly model: string;
  embed(texts: readonly string[], role: EmbeddingRole): Promise<EmbeddingBatch>;
}
