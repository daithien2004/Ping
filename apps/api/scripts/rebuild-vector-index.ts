/** pnpm --filter api ai:rebuild [-- --recreate | --batch=100]  (--recreate xoá collection rồi dựng lại) */
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { MessageIndexerCore } from '../src/modules/ai/indexer/message-indexer.core.js';
import { OnnxEmbedder } from '../src/modules/ai/onnx-embedder.js';
import { QdrantVectorStore } from '../src/modules/ai/qdrant-vector-store.js';
import { collectionName, embeddingVersion } from '../src/modules/ai/vector-schema.js';
import { backfillMessages } from './lib/backfill.js';

config({ path: '../../.env', quiet: true });

function arg(name: string, fallback: string): string {
  const withEquals = process.argv.find((item) => item.startsWith(`--${name}=`));
  if (withEquals) return withEquals.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  const next = index >= 0 ? process.argv[index + 1] : undefined;
  return next && !next.startsWith('--') ? next : fallback;
}

const databaseUrl = process.env.DATABASE_URL;
const qdrantUrl = process.env.QDRANT_URL;
if (!databaseUrl) throw new Error('Thiếu DATABASE_URL');
if (!qdrantUrl) throw new Error('Thiếu QDRANT_URL');

const model = process.env.EMBEDDING_MODEL || 'Xenova/multilingual-e5-small';
const requestedBatch = Number(arg('batch', '64'));
const pageSize =
  Number.isFinite(requestedBatch) && requestedBatch > 0 && requestedBatch <= 256
    ? Math.floor(requestedBatch)
    : 64;
const recreate = process.argv.includes('--recreate');
const windowSize = Number(process.env.AI_CHUNK_WINDOW ?? 4);
const maxTokens = Number(process.env.AI_CHUNK_MAX_TOKENS ?? 512);

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl, max: 2 }),
});
const embedder = new OnnxEmbedder(model);
const store = new QdrantVectorStore(qdrantUrl);

try {
  // Cần biết số chiều trước khi xoá collection: embed một câu thăm dò.
  const probe = await embedder.embed(['khởi tạo chỉ mục'], 'passage');
  const collection = collectionName(model, probe.dimensions);
  const modelVersion = embeddingVersion(model, probe.dimensions);
  if (recreate) await store.deleteCollection(collection);
  await store.ensureCollection(collection, probe.dimensions);

  const core = new MessageIndexerCore(prisma, embedder, store, {
    windowSize: Number.isFinite(windowSize) ? windowSize : 4,
    maxTokens: Number.isFinite(maxTokens) ? maxTokens : 512,
  });
  const result = await backfillMessages({
    prisma,
    core,
    ratePerSecond: 0,
    pageSize,
    onProgress: (processed) => {
      if (processed % 50 === 0) console.log(`đã xử lý ${processed} tin`);
    },
  });
  const points = await store.count(collection);
  console.log(
    JSON.stringify(
      {
        collection,
        modelVersion,
        messages: result.processed,
        points,
        pageSize,
        recreated: recreate,
        durationMs: result.durationMs,
        qdrant: qdrantUrl,
      },
      null,
      2,
    ),
  );
} finally {
  await prisma.$disconnect();
}
