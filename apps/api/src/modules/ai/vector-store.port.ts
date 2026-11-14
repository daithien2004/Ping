// Payload KHÔNG chứa nội dung tin: luôn hydrate lại từ Postgres sau khi lọc quyền.
export interface VectorPayload {
  serverId: string;
  channelId: string;
  authorId: string;
  /** ISO-8601 */
  createdAt: string;
  messageIds: string[];
  modelVersion: string;
}

export interface VectorPoint {
  id: string;
  vector: number[];
  payload: VectorPayload;
}

export interface VectorSearchOptions {
  serverId: string;
  channelId?: string;
  limit: number;
}

export interface VectorSearchHit {
  id: string;
  score: number;
  payload: VectorPayload;
}

export interface VectorStore {
  ensureCollection(collection: string, dimensions: number): Promise<void>;
  upsert(collection: string, points: readonly VectorPoint[]): Promise<void>;
  deleteByMessageIds(collection: string, messageIds: readonly string[]): Promise<void>;
  search(
    collection: string,
    vector: readonly number[],
    options: VectorSearchOptions,
  ): Promise<VectorSearchHit[]>;
  count(collection: string): Promise<number>;
  deleteCollection(collection: string): Promise<void>;
  health(): Promise<boolean>;
}

export class VectorStoreError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'VectorStoreError';
  }
}
