import {
  type VectorPayload,
  type VectorPoint,
  type VectorSearchHit,
  type VectorSearchOptions,
  type VectorStore,
  VectorStoreError,
} from './vector-store.port.js';

const BATCH_SIZE = 64;

interface QdrantCountResponse {
  result?: { count?: number };
}

interface QdrantSearchResponse {
  result?: unknown;
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

/**
 * Payload do Qdrant trả về là JSON không tin cậy (có thể do index cũ/hỏng hoặc
 * người vận hành sửa tay). Chỉ nhận đúng hình dạng tối thiểu; point hỏng bị bỏ
 * qua để không bao giờ đi tiếp vào prompt với dữ liệu nửa vời.
 */
function parsePayload(value: unknown): VectorPayload | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return undefined;
  }
  const payload = value as Record<string, unknown>;
  if (
    !nonEmptyString(payload.serverId) ||
    !nonEmptyString(payload.channelId) ||
    !nonEmptyString(payload.authorId) ||
    !nonEmptyString(payload.createdAt) ||
    !nonEmptyString(payload.modelVersion) ||
    !Array.isArray(payload.messageIds) ||
    payload.messageIds.length === 0 ||
    !payload.messageIds.every((id) => nonEmptyString(id))
  ) {
    return undefined;
  }

  return {
    serverId: payload.serverId,
    channelId: payload.channelId,
    authorId: payload.authorId,
    createdAt: payload.createdAt,
    messageIds: payload.messageIds,
    modelVersion: payload.modelVersion,
  };
}

/**
 * Adapter Qdrant REST (không thêm SDK). Chỉ dùng các endpoint ổn định:
 * tạo collection, tạo payload index, upsert/xoá point, đếm, health.
 *
 * `baseUrl` rỗng = tính năng vector tắt; mọi thao tác ném `VectorStoreError`
 * để tầng trên suy giảm thay vì crash.
 */
export class QdrantVectorStore implements VectorStore {
  private readonly baseUrl: string | undefined;

  constructor(
    url: string | undefined,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly timeoutMs = 5_000,
    private readonly observe?: (seconds: number, outcome: 'ok' | 'error') => void,
  ) {
    this.baseUrl = url?.replace(/\/+$/g, '') || undefined;
  }

  async ensureCollection(collection: string, dimensions: number): Promise<void> {
    if (!(await this.collectionExists(collection))) {
      await this.request(
        `/collections/${encodeURIComponent(collection)}`,
        {
          method: 'PUT',
          body: JSON.stringify({ vectors: { size: dimensions, distance: 'Cosine' } }),
        },
        [200, 201, 409],
      );
    }
    await this.ensurePayloadIndexes(collection);
  }

  async upsert(collection: string, points: readonly VectorPoint[]): Promise<void> {
    for (let start = 0; start < points.length; start += BATCH_SIZE) {
      const batch = points.slice(start, start + BATCH_SIZE);
      await this.request(`/collections/${encodeURIComponent(collection)}/points?wait=true`, {
        method: 'PUT',
        body: JSON.stringify({
          points: batch.map((point) => ({
            id: point.id,
            vector: point.vector,
            payload: point.payload,
          })),
        }),
      });
    }
  }

  async deleteByMessageIds(collection: string, messageIds: readonly string[]): Promise<void> {
    if (messageIds.length === 0) return;
    await this.request(`/collections/${encodeURIComponent(collection)}/points/delete?wait=true`, {
      method: 'POST',
      body: JSON.stringify({ points: [...messageIds] }),
    });
  }

  async search(
    collection: string,
    vector: readonly number[],
    options: VectorSearchOptions,
  ): Promise<VectorSearchHit[]> {
    if (vector.length === 0) {
      throw new VectorStoreError('Vector truy vấn rỗng');
    }
    if (!Number.isInteger(options.limit) || options.limit <= 0) {
      throw new VectorStoreError('Số lượng kết quả không hợp lệ');
    }

    // Lọc server ngay trong Qdrant: kể cả khi payload bị sửa, tầng hydrate vẫn
    // kiểm lại server/channel từ Postgres. `channelId` chỉ là tối ưu phạm vi.
    const must: Record<string, unknown>[] = [
      { key: 'serverId', match: { value: options.serverId } },
    ];
    if (options.channelId) {
      must.push({ key: 'channelId', match: { value: options.channelId } });
    }

    const response = await this.request(
      `/collections/${encodeURIComponent(collection)}/points/search`,
      {
        method: 'POST',
        body: JSON.stringify({
          vector: [...vector],
          limit: options.limit,
          with_payload: true,
          with_vector: false,
          filter: { must },
        }),
      },
    );
    const body = (await response.json()) as QdrantSearchResponse;
    if (!Array.isArray(body.result)) {
      throw new VectorStoreError('Qdrant trả về kết quả tìm kiếm không hợp lệ');
    }

    const hits: VectorSearchHit[] = [];
    for (const item of body.result) {
      if (item === null || typeof item !== 'object' || Array.isArray(item)) continue;
      const raw = item as { id?: unknown; score?: unknown; payload?: unknown };
      if (!nonEmptyString(raw.id) || typeof raw.score !== 'number' || !Number.isFinite(raw.score)) {
        continue;
      }
      const payload = parsePayload(raw.payload);
      if (!payload) continue;
      // Qdrant đã lọc, nhưng kiểm lại để một bản ghi lỗi không vượt qua ranh giới server.
      if (payload.serverId !== options.serverId) continue;
      if (options.channelId && payload.channelId !== options.channelId) continue;
      hits.push({ id: raw.id, score: raw.score, payload });
    }
    return hits;
  }

  async count(collection: string): Promise<number> {
    const response = await this.request(
      `/collections/${encodeURIComponent(collection)}/points/count`,
      { method: 'POST', body: JSON.stringify({ exact: true }) },
    );
    const body = (await response.json()) as QdrantCountResponse;
    return body.result?.count ?? 0;
  }

  async deleteCollection(collection: string): Promise<void> {
    if (!(await this.collectionExists(collection))) return;
    await this.request(`/collections/${encodeURIComponent(collection)}`, { method: 'DELETE' });
  }

  async health(): Promise<boolean> {
    if (!this.baseUrl) return false;
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/readyz`, {
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  private async collectionExists(collection: string): Promise<boolean> {
    const response = await this.rawRequest(`/collections/${encodeURIComponent(collection)}`);
    if (response.status === 404) return false;
    if (!response.ok) {
      throw new VectorStoreError(`Qdrant trả về HTTP ${response.status}`, response.status);
    }
    return true;
  }

  private async ensurePayloadIndexes(collection: string): Promise<void> {
    const indexes: { field_name: string; field_schema: string }[] = [
      { field_name: 'serverId', field_schema: 'keyword' },
      { field_name: 'channelId', field_schema: 'keyword' },
      { field_name: 'authorId', field_schema: 'keyword' },
      { field_name: 'createdAt', field_schema: 'datetime' },
      { field_name: 'modelVersion', field_schema: 'keyword' },
    ];

    for (const index of indexes) {
      await this.request(
        `/collections/${encodeURIComponent(collection)}/index?wait=true`,
        { method: 'PUT', body: JSON.stringify(index) },
        [200, 201, 409],
      );
    }
  }

  private async request(
    path: string,
    init: RequestInit = {},
    expected: number[] = [200],
  ): Promise<Response> {
    const response = await this.rawRequest(path, init);
    if (!expected.includes(response.status)) {
      // Không đưa body vào lỗi: có thể chứa dữ liệu đầu vào.
      throw new VectorStoreError(`Qdrant trả về HTTP ${response.status}`, response.status);
    }
    return response;
  }

  private async rawRequest(path: string, init: RequestInit = {}): Promise<Response> {
    if (!this.baseUrl) {
      throw new VectorStoreError('Thiếu QDRANT_URL');
    }
    const started = performance.now();
    let outcome: 'ok' | 'error' = 'error';
    try {
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        headers: { 'content-type': 'application/json', ...init.headers },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      outcome = response.ok ? 'ok' : 'error';
      return response;
    } finally {
      this.observe?.((performance.now() - started) / 1_000, outcome);
    }
  }
}
