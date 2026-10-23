/**
 * Rebuild toàn bộ chỉ mục vector từ Postgres (T5.2).
 *
 * Postgres là nguồn sự thật; Qdrant chỉ là chỉ mục có thể dựng lại. Script này đọc
 * tin nhắn chưa xoá, embed theo lô, upsert idempotent (point id = message id) và
 * kiểm tra lại số point. Không lưu nội dung tin nhắn trong payload.
 *
 *   pnpm --filter api ai:rebuild              # upsert, giữ point cũ
 *   pnpm --filter api ai:rebuild -- --recreate # xoá collection rồi dựng lại
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { OnnxEmbedder } from '../src/modules/ai/onnx-embedder.js';
import { QdrantVectorStore } from '../src/modules/ai/qdrant-vector-store.js';
import { collectionName, embeddingVersion } from '../src/modules/ai/vector-schema.js';
import type { VectorPoint } from '../src/modules/ai/vector-store.port.js';

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
const batchSize =
  Number.isFinite(requestedBatch) && requestedBatch > 0 && requestedBatch <= 256
    ? Math.floor(requestedBatch)
    : 64;
const recreate = process.argv.includes('--recreate');

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl, max: 2 }),
});
const embedder = new OnnxEmbedder(model);
const store = new QdrantVectorStore(qdrantUrl);

const started = performance.now();
let cursor: string | undefined;
let messages = 0;
let batches = 0;
let collection: string | undefined;
let modelVersion: string | undefined;

try {
  do {
    const rows = await prisma.message.findMany({
      where: { deletedAt: null },
      include: { channel: { select: { serverId: true } } },
      orderBy: { id: 'asc' },
      take: batchSize,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (rows.length === 0) break;

    cursor = rows.at(-1)?.id;
    const embedded = await embedder.embed(
      rows.map((row) => row.content),
      'passage',
    );

    if (!collection || !modelVersion) {
      collection = collectionName(model, embedded.dimensions);
      modelVersion = embeddingVersion(model, embedded.dimensions);
      if (recreate) await store.deleteCollection(collection);
      await store.ensureCollection(collection, embedded.dimensions);
    }

    const points: VectorPoint[] = rows.map((row, index) => ({
      id: row.id,
      vector: embedded.vectors[index] ?? [],
      payload: {
        serverId: row.channel.serverId,
        channelId: row.channelId,
        authorId: row.authorId,
        createdAt: row.createdAt.toISOString(),
        messageIds: [row.id],
        modelVersion: modelVersion ?? '',
      },
    }));

    await store.upsert(collection, points);
    messages += points.length;
    batches += 1;
    console.log(`đã xử lý ${messages} tin (${batches} lô)`);
  } while (cursor);

  // Database rỗng vẫn tạo collection để lần index đầu tiên không phải chờ.
  if (!collection || !modelVersion) {
    const probe = await embedder.embed(['khởi tạo chỉ mục'], 'passage');
    collection = collectionName(model, probe.dimensions);
    modelVersion = embeddingVersion(model, probe.dimensions);
    if (recreate) await store.deleteCollection(collection);
    await store.ensureCollection(collection, probe.dimensions);
  }

  const points = await store.count(collection);
  console.log(
    JSON.stringify(
      {
        collection,
        modelVersion,
        messages,
        points,
        batches,
        recreated: recreate,
        durationMs: Math.round(performance.now() - started),
        qdrant: qdrantUrl,
      },
      null,
      2,
    ),
  );
} finally {
  await prisma.$disconnect();
}
