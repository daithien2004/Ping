/**
 * Worker indexer tối giản cho drill crash (T5.3).
 *
 * Chạy thật `IndexerRunner` + `MessageIndexerCore` trên Redis/Postgres/Qdrant,
 * nhưng dùng FakeEmbedder để không tải model. Bao store bằng một lớp trễ sau
 * upsert để drill có thể kill đúng lúc point đã ghi nhưng entry chưa XACK.
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
import { Redis } from 'ioredis';
import { PrismaClient } from '../../src/generated/prisma/client.js';
import { FakeEmbedder } from '../../src/modules/ai/fake-embedder.js';
import { IndexerRunner } from '../../src/modules/ai/indexer/indexer.runner.js';
import { MessageIndexerCore } from '../../src/modules/ai/indexer/message-indexer.core.js';
import { QdrantVectorStore } from '../../src/modules/ai/qdrant-vector-store.js';
import type { VectorPoint, VectorStore } from '../../src/modules/ai/vector-store.port.js';

config({ path: '../../.env', quiet: true });

const databaseUrl = process.env.DATABASE_URL;
const qdrantUrl = process.env.QDRANT_URL;
const redisUrl = process.env.REDIS_URL;
if (!databaseUrl || !qdrantUrl || !redisUrl) {
  throw new Error('Thiếu DATABASE_URL/QDRANT_URL/REDIS_URL');
}

const delayMs = Number(process.env.INDEXER_UPSERT_DELAY_MS ?? '150');
const consumer = process.env.INDEXER_CONSUMER ?? `drill-${process.pid}`;
const claimIdleMs = Number(process.env.INDEXER_CLAIM_IDLE_MS ?? '1000');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl, max: 2 }),
});
const redis = new Redis(redisUrl, { maxRetriesPerRequest: null });
const qdrant = new QdrantVectorStore(qdrantUrl);
const slowStore: VectorStore = {
  ensureCollection: (collection, dimensions) => qdrant.ensureCollection(collection, dimensions),
  upsert: async (collection, points: readonly VectorPoint[]) => {
    await qdrant.upsert(collection, points);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  },
  deleteByMessageIds: (collection, ids) => qdrant.deleteByMessageIds(collection, ids),
  search: (collection, vector, options) => qdrant.search(collection, vector, options),
  count: (collection) => qdrant.count(collection),
  deleteCollection: (collection) => qdrant.deleteCollection(collection),
  health: () => qdrant.health(),
};

const core = new MessageIndexerCore(prisma, new FakeEmbedder(), slowStore, {
  windowSize: Number(process.env.AI_CHUNK_WINDOW ?? 4),
  maxTokens: Number(process.env.AI_CHUNK_MAX_TOKENS ?? 512),
});
const runner = new IndexerRunner(redis, core, {
  consumer,
  claimIdleMs,
  onError: (error, context) => console.error(JSON.stringify({ context, error: String(error) })),
});
runner.start();
console.log(JSON.stringify({ worker: 'started', consumer, claimIdleMs, delayMs }));

async function shutdown(): Promise<void> {
  await runner.stop();
  await prisma.$disconnect();
  await redis.quit();
  process.exit(0);
}

process.on('SIGTERM', () => void shutdown());
process.on('SIGINT', () => void shutdown());
