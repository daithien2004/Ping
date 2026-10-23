import { describe, expect, it, vi } from 'vitest';
import { QdrantVectorStore } from './qdrant-vector-store.js';
import type { VectorPoint } from './vector-store.port.js';
import { VectorStoreError } from './vector-store.port.js';

function response(status = 200, body = ''): Response {
  return new Response(body, { status, headers: { 'content-type': 'application/json' } });
}

function fetchMock(handler: (url: string, init: RequestInit) => Response | Promise<Response>) {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit) =>
    handler(String(input), init ?? {}),
  ) as unknown as typeof fetch;
}

interface Call {
  url: string;
  method: string;
  body: string | undefined;
}

function calls(fetchImpl: typeof fetch): Call[] {
  return (
    fetchImpl as unknown as { mock: { calls: [RequestInfo | URL, RequestInit?][] } }
  ).mock.calls.map(([input, init]) => ({
    url: String(input),
    method: init?.method ?? 'GET',
    body: typeof init?.body === 'string' ? init.body : undefined,
  }));
}

function points(count: number): VectorPoint[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `00000000-0000-7000-8000-${String(index).padStart(12, '0')}`,
    vector: [0.1, 0.2, 0.3],
    payload: {
      serverId: 'server-1',
      channelId: 'channel-1',
      authorId: 'author-1',
      createdAt: '2026-10-23T00:00:00.000Z',
      messageIds: [`message-${index}`],
      modelVersion: 'model:3:schema1',
    },
  }));
}

describe('QdrantVectorStore', () => {
  it('báo không có vector store khi thiếu QDRANT_URL, không gọi mạng', async () => {
    const fetchImpl = fetchMock(() => response());
    const store = new QdrantVectorStore(undefined, fetchImpl);

    expect(await store.health()).toBe(false);
    await expect(store.ensureCollection('messages', 3)).rejects.toBeInstanceOf(VectorStoreError);
    expect(calls(fetchImpl)).toHaveLength(0);
  });

  it('tạo collection và 5 payload index khi collection chưa tồn tại', async () => {
    const fetchImpl = fetchMock((url, init) => {
      if ((init.method ?? 'GET') === 'GET') return response(404);
      return response(200);
    });
    const store = new QdrantVectorStore('http://qdrant:6333/', fetchImpl);

    await store.ensureCollection('messages__test__3__v1', 3);

    const all = calls(fetchImpl);
    const collectionPut = all.find(
      (call) => call.method === 'PUT' && call.url.endsWith('/collections/messages__test__3__v1'),
    );
    expect(collectionPut).toBeDefined();
    expect(JSON.parse(collectionPut?.body ?? '{}')).toEqual({
      vectors: { size: 3, distance: 'Cosine' },
    });

    const indexFields = all
      .filter((call) => call.url.includes('/index?wait=true'))
      .map((call) => JSON.parse(call.body ?? '{}').field_name);
    expect(indexFields).toEqual(['serverId', 'channelId', 'authorId', 'createdAt', 'modelVersion']);
    expect(all.every((call) => call.url.startsWith('http://qdrant:6333/'))).toBe(true);
  });

  it('không tạo lại collection đã tồn tại', async () => {
    const fetchImpl = fetchMock(() => response(200));
    const store = new QdrantVectorStore('http://qdrant:6333', fetchImpl);

    await store.ensureCollection('messages__test__3__v1', 3);

    const collectionPuts = calls(fetchImpl).filter(
      (call) => call.method === 'PUT' && call.url.endsWith('/collections/messages__test__3__v1'),
    );
    expect(collectionPuts).toHaveLength(0);
  });

  it('upsert theo lô 64 point và giữ nguyên payload', async () => {
    const fetchImpl = fetchMock(() => response(200));
    const store = new QdrantVectorStore('http://qdrant:6333', fetchImpl);

    await store.upsert('messages__test__3__v1', points(70));

    const upserts = calls(fetchImpl).filter((call) => call.url.includes('/points?wait=true'));
    expect(upserts).toHaveLength(2);
    expect(JSON.parse(upserts[0]?.body ?? '{}').points).toHaveLength(64);
    expect(JSON.parse(upserts[1]?.body ?? '{}').points).toHaveLength(6);
    expect(JSON.parse(upserts[0]?.body ?? '{}').points[0]).toMatchObject({
      id: '00000000-0000-7000-8000-000000000000',
      vector: [0.1, 0.2, 0.3],
      payload: { messageIds: ['message-0'], modelVersion: 'model:3:schema1' },
    });
  });

  it('xoá theo message id, bỏ qua danh sách rỗng', async () => {
    const fetchImpl = fetchMock(() => response(200));
    const store = new QdrantVectorStore('http://qdrant:6333', fetchImpl);

    await store.deleteByMessageIds('messages__test__3__v1', []);
    expect(calls(fetchImpl)).toHaveLength(0);

    await store.deleteByMessageIds('messages__test__3__v1', ['id-1', 'id-2']);
    const deletes = calls(fetchImpl).filter((call) =>
      call.url.includes('/points/delete?wait=true'),
    );
    expect(deletes).toHaveLength(1);
    expect(JSON.parse(deletes[0]?.body ?? '{}')).toEqual({ points: ['id-1', 'id-2'] });
  });

  it('đọc số point chính xác', async () => {
    const fetchImpl = fetchMock(() => response(200, JSON.stringify({ result: { count: 42 } })));
    const store = new QdrantVectorStore('http://qdrant:6333', fetchImpl);

    expect(await store.count('messages__test__3__v1')).toBe(42);
  });

  it('search lọc server/channel và bỏ point có payload hỏng hoặc sai server', async () => {
    const payload = {
      serverId: 'server-1',
      channelId: 'channel-1',
      authorId: 'author-1',
      createdAt: '2026-10-23T00:00:00.000Z',
      messageIds: ['message-1'],
      modelVersion: 'model:3:schema1',
    };
    const fetchImpl = fetchMock(() =>
      response(
        200,
        JSON.stringify({
          result: [
            { id: 'point-ok', score: 0.91, payload },
            {
              id: 'point-other-server',
              score: 0.88,
              payload: { ...payload, serverId: 'server-2' },
            },
            {
              id: 'point-other-channel',
              score: 0.87,
              payload: { ...payload, channelId: 'channel-2' },
            },
            {
              id: 'point-bad-payload',
              score: 0.86,
              payload: { ...payload, messageIds: ['message-1', 42] },
            },
          ],
        }),
      ),
    );
    const store = new QdrantVectorStore('http://qdrant:6333', fetchImpl);

    const hits = await store.search('messages__test__3__v1', [0.1, 0.2, 0.3], {
      serverId: 'server-1',
      channelId: 'channel-1',
      limit: 5,
    });

    expect(hits).toEqual([{ id: 'point-ok', score: 0.91, payload }]);
    const searchCall = calls(fetchImpl).find((call) => call.url.endsWith('/points/search'));
    expect(searchCall?.method).toBe('POST');
    expect(JSON.parse(searchCall?.body ?? '{}')).toEqual({
      vector: [0.1, 0.2, 0.3],
      limit: 5,
      with_payload: true,
      with_vector: false,
      filter: {
        must: [
          { key: 'serverId', match: { value: 'server-1' } },
          { key: 'channelId', match: { value: 'channel-1' } },
        ],
      },
    });
  });

  it('search ném lỗi thay vì trả rỗng khi Qdrant trả kết quả sai hình dạng', async () => {
    const fetchImpl = fetchMock(() => response(200, JSON.stringify({ result: 'không phải mảng' })));
    const store = new QdrantVectorStore('http://qdrant:6333', fetchImpl);

    await expect(
      store.search('messages__test__3__v1', [0.1], { serverId: 'server-1', limit: 5 }),
    ).rejects.toBeInstanceOf(VectorStoreError);
  });

  it('ném VectorStoreError khi Qdrant trả lỗi, không lộ body', async () => {
    const fetchImpl = fetchMock(() => response(500, 'vector bi mat'));
    const store = new QdrantVectorStore('http://qdrant:6333', fetchImpl);

    const error = await store.ensureCollection('messages__test__3__v1', 3).catch((cause) => cause);
    expect(error).toBeInstanceOf(VectorStoreError);
    expect((error as Error).message).toBe('Qdrant trả về HTTP 500');
    expect((error as Error).message).not.toContain('vector bi mat');
  });
});
