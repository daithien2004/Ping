import type { PrismaClient } from '../../../generated/prisma/client.js';
import { describe, expect, it, vi } from 'vitest';
import type { Embedder, EmbeddingBatch, EmbeddingRole } from '../embedder.port.js';
import type { VectorPoint, VectorSearchHit, VectorStore } from '../vector-store.port.js';
import { MessageIndexerCore } from './message-indexer.core.js';

interface FakeMessage {
  id: string;
  channelId: string;
  authorId: string;
  content: string;
  deletedAt: Date | null;
  createdAt: Date;
  author: { displayName: string; username: string };
  channel: { serverId: string };
}

class RecordingEmbedder implements Embedder {
  readonly model = 'fake-embedder';
  readonly texts: string[] = [];

  async embed(texts: readonly string[], _role: EmbeddingRole): Promise<EmbeddingBatch> {
    this.texts.push(...texts);
    return {
      model: this.model,
      dimensions: 4,
      vectors: texts.map((_, index) => [index, 0, 0, 1]),
    };
  }
}

class RecordingStore implements VectorStore {
  readonly ensured: string[] = [];
  readonly upserts: { collection: string; points: readonly VectorPoint[] }[] = [];
  readonly deletes: { collection: string; ids: readonly string[] }[] = [];

  async ensureCollection(collection: string): Promise<void> {
    this.ensured.push(collection);
  }
  async upsert(collection: string, points: readonly VectorPoint[]): Promise<void> {
    this.upserts.push({ collection, points });
  }
  async deleteByMessageIds(collection: string, ids: readonly string[]): Promise<void> {
    this.deletes.push({ collection, ids });
  }
  async search(): Promise<VectorSearchHit[]> {
    return [];
  }
  async count(): Promise<number> {
    return 0;
  }
  async deleteCollection(): Promise<void> {}
  async health(): Promise<boolean> {
    return true;
  }
}

function message(id: string, content: string, channelId = 'channel-1'): FakeMessage {
  return {
    id,
    channelId,
    authorId: 'author-1',
    content,
    deletedAt: null,
    createdAt: new Date('2026-10-23T10:00:00.000Z'),
    author: { displayName: 'An', username: 'an' },
    channel: { serverId: 'server-1' },
  };
}

function buildCore(
  rows: FakeMessage[],
  options: { windowSize?: number; followers?: FakeMessage[] } = {},
) {
  const prisma = {
    message: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const row = rows.find((candidate) => candidate.id === where.id);
        if (!row) return null;
        // Lời gọi chỉ select channelId (delete) vẫn trả object đủ field.
        return row;
      }),
      findMany: vi.fn(async (args: { where: { id?: { lt?: string; gt?: string } } }) => {
        if (args.where.id?.gt) return options.followers ?? [];
        return rows
          .filter((row) => row.channelId === 'channel-1' && row.id < (args.where.id?.lt ?? ''))
          .sort((a, b) => b.id.localeCompare(a.id));
      }),
    },
  } as unknown as PrismaClient;

  const embedder = new RecordingEmbedder();
  const store = new RecordingStore();
  const core = new MessageIndexerCore(prisma, embedder, store, {
    windowSize: options.windowSize ?? 4,
    maxTokens: 10_000,
  });
  return { core, embedder, store };
}

describe('MessageIndexerCore', () => {
  it('upsert point neo vào tin, chunk gồm tin liền trước và payload không chứa nội dung', async () => {
    const rows = [message('m1', 'câu một'), message('m2', 'câu hai'), message('m3', 'câu ba')];
    const { core, embedder, store } = buildCore(rows);

    await core.syncMessage('m3');

    expect(embedder.texts).toContain('An: câu một\nAn: câu hai\nAn: câu ba');
    expect(store.ensured).toEqual(['messages__fake_embedder__4__v1']);
    expect(store.upserts).toHaveLength(1);
    const point = store.upserts[0]!.points[0]!;
    expect(point.id).toBe('m3');
    expect(point.payload.messageIds).toEqual(['m1', 'm2', 'm3']);
    expect(Object.keys(point.payload)).not.toContain('content');
  });

  it('sửa tin thì embed lại chính nó và các tin phía sau trong cửa sổ', async () => {
    const rows = [message('m1', 'câu một'), message('m2', 'câu hai')];
    const followers = [message('m2', 'câu hai')];
    const { core, embedder, store } = buildCore(rows, { followers, windowSize: 2 });

    await core.handleEvent('message.updated', 'm1');

    expect(store.upserts).toHaveLength(2);
    expect(store.upserts.map((entry) => entry.points[0]!.id)).toEqual(['m1', 'm2']);
    expect(embedder.texts.length).toBeGreaterThanOrEqual(3);
  });

  it('xoá tin thì xoá point rồi embed lại các tin phía sau', async () => {
    const rows = [message('m1', 'câu một'), message('m2', 'câu hai')];
    const followers = [message('m2', 'câu hai')];
    const { core, store } = buildCore(rows, { followers });

    await core.handleEvent('message.deleted', 'm1');

    expect(store.deletes[0]).toEqual({ collection: 'messages__fake_embedder__4__v1', ids: ['m1'] });
    expect(store.upserts.map((entry) => entry.points[0]!.id)).toEqual(['m2']);
  });

  it('tin đã xoá mềm thì không embed, chỉ xoá point', async () => {
    const deleted = { ...message('m1', 'câu một'), deletedAt: new Date() };
    const { core, embedder, store } = buildCore([deleted]);

    await core.syncMessage('m1');

    expect(store.upserts).toHaveLength(0);
    expect(store.deletes[0]?.ids).toEqual(['m1']);
    expect(embedder.texts).toEqual(['khởi tạo chỉ mục']);
  });
});
