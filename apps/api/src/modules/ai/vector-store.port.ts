/**
 * Cổng lưu vector (Qdrant). Payload cố ý **không chứa nội dung tin nhắn**: nội dung
 * luôn hydrate lại từ Postgres sau khi lọc quyền (T5.4), tránh rò rỉ qua vector store.
 */
export interface VectorPayload {
  serverId: string;
  channelId: string;
  authorId: string;
  /** ISO-8601, để Qdrant lọc theo thời gian. */
  createdAt: string;
  /** Một point có thể đại diện cho một chunk nhiều tin liền kề. */
  messageIds: string[];
  /** `model:dimensions:schemaVersion`, khớp với collection đang dùng. */
  modelVersion: string;
}

export interface VectorPoint {
  /** UUID tin nhắn (hoặc UUID chunk) — upsert idempotent. */
  id: string;
  vector: number[];
  payload: VectorPayload;
}

export interface VectorSearchOptions {
  /** Bắt buộc: không bao giờ tìm xuyên server. */
  serverId: string;
  /** Thu hẹp trong một channel; quyền channel vẫn được kiểm lại ở tầng hydrate. */
  channelId?: string;
  limit: number;
}

export interface VectorSearchHit {
  /** Id point = id tin neo của chunk. */
  id: string;
  score: number;
  payload: VectorPayload;
}

export interface VectorStore {
  ensureCollection(collection: string, dimensions: number): Promise<void>;
  upsert(collection: string, points: readonly VectorPoint[]): Promise<void>;
  deleteByMessageIds(collection: string, messageIds: readonly string[]): Promise<void>;
  /**
   * Tìm point gần nhất, luôn lọc theo `serverId`. Chỉ trả payload đã được kiểm
   * hình dạng; point hỏng bị bỏ qua thay vì đưa lên tầng RAG.
   */
  search(
    collection: string,
    vector: readonly number[],
    options: VectorSearchOptions,
  ): Promise<VectorSearchHit[]>;
  count(collection: string): Promise<number>;
  deleteCollection(collection: string): Promise<void>;
  health(): Promise<boolean>;
}

/** Vector store chưa cấu hình hoặc lỗi: tầng gọi phải suy giảm như AI (T5.7). */
export class VectorStoreError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'VectorStoreError';
  }
}
