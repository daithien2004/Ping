/**
 * Backfill chỉ mục vector từ Postgres (T5.3).
 *
 * Dùng đúng `MessageIndexerCore` như consumer realtime (cùng chunk cửa sổ, cùng
 * payload) nên chạy lại không làm lệch chỉ mục. Tốc độ mặc định 10 tin/giây để
 * không giành CPU với API; `--after` cho phép chạy tiếp sau khi dừng.
 *
 *   pnpm --filter api ai:backfill
 *   pnpm --filter api ai:backfill -- --rate=20 --limit=500
 *   pnpm --filter api ai:backfill -- --after=<message-id>
 */
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { MessageIndexerCore } from '../src/modules/ai/indexer/message-indexer.core.js';
import { OnnxEmbedder } from '../src/modules/ai/onnx-embedder.js';
import { QdrantVectorStore } from '../src/modules/ai/qdrant-vector-store.js';
import { backfillMessages, parseRate } from './lib/backfill.js';

config({ path: '../../.env', quiet: true });

function arg(name: string, fallback?: string): string | undefined {
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
const rate = parseRate(arg('rate'));
const after = arg('after');
const rawLimit = Number(arg('limit', '0'));
const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.floor(rawLimit) : undefined;
const windowSize = Number(process.env.AI_CHUNK_WINDOW ?? 4);
const maxTokens = Number(process.env.AI_CHUNK_MAX_TOKENS ?? 512);

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: databaseUrl, max: 2 }),
});
const embedder = new OnnxEmbedder(model);
const store = new QdrantVectorStore(qdrantUrl);
const core = new MessageIndexerCore(prisma, embedder, store, {
  windowSize: Number.isFinite(windowSize) ? windowSize : 4,
  maxTokens: Number.isFinite(maxTokens) ? maxTokens : 512,
});

const started = performance.now();
try {
  const result = await backfillMessages({
    prisma,
    core,
    ratePerSecond: rate,
    ...(after ? { after } : {}),
    ...(limit !== undefined ? { limit } : {}),
    onProgress: (processed, lastId) => {
      if (processed % 50 === 0) {
        console.log(`đã xử lý ${processed} tin (id cuối ${lastId})`);
      }
    },
  });
  console.log(
    JSON.stringify(
      {
        model,
        ratePerSecond: rate,
        windowSize,
        maxTokens,
        processed: result.processed,
        lastId: result.lastId ?? null,
        durationMs: result.durationMs,
        messagesPerSecond:
          result.durationMs > 0
            ? Number(((result.processed * 1000) / result.durationMs).toFixed(2))
            : 0,
        qdrant: qdrantUrl,
        totalDurationMs: Math.round(performance.now() - started),
      },
      null,
      2,
    ),
  );
} finally {
  await prisma.$disconnect();
}
