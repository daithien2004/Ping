/**
 * Đánh giá embedding cho T5.1 (ADR-0046).
 *
 * Chạy một model mỗi lần để số đo RAM không bị ảnh hưởng bởi model trước:
 *   pnpm --filter api exec tsx scripts/eval-embeddings.ts --model Xenova/multilingual-e5-small
 *
 * Kết quả ghi vào docs/v0.2.0/evidence/T5.1/embedding-eval.<slug>.json.
 * Bộ dữ liệu là tin nhắn demo tiếng Việt, không phải dữ liệu người dùng thật.
 */
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { OnnxEmbedder } from '../src/modules/ai/onnx-embedder.js';

interface Message {
  id: string;
  channel: string;
  author: string;
  content: string;
}

interface Query {
  id: string;
  query: string;
  relevant: string[];
}

interface Dataset {
  messages: Message[];
  queries: Query[];
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const apiDir = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(apiDir, '../..');
const cacheDir = process.env.EVAL_CACHE_DIR
  ? path.resolve(process.env.EVAL_CACHE_DIR)
  : path.join(apiDir, '.cache', 'transformers');

function arg(name: string, fallback: string): string {
  const withEquals = process.argv.find((item) => item.startsWith(`--${name}=`));
  if (withEquals) return withEquals.slice(name.length + 3);
  const index = process.argv.indexOf(`--${name}`);
  const next = index >= 0 ? process.argv[index + 1] : undefined;
  return next && !next.startsWith('--') ? next : fallback;
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let index = 0; index < a.length; index += 1) dot += (a[index] ?? 0) * (b[index] ?? 0);
  // Vector đã chuẩn hoá nên không cần chia norm.
  return dot;
}

function rank(vectors: number[][], query: number[], ids: string[]): string[] {
  return ids
    .map((id, index) => ({ id, score: cosine(query, vectors[index] ?? []) }))
    .sort((left, right) => right.score - left.score)
    .map((item) => item.id);
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[index] ?? 0;
}

const STOP_WORDS = new Set(
  'là gì khi nào của và có không được mấy ai ở ra cho với một các những để từ trong trên về hay thì mà này đó mình bạn tôi'.split(
    ' ',
  ),
);

function tokens(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length > 1 && !STOP_WORDS.has(token));
}

/** Baseline túi từ (không phải Postgres FTS) để so sánh tương đối. */
function lexicalRank(query: string, messages: Message[]): string[] {
  const queryTokens = new Set(tokens(query));
  return messages
    .map((message) => {
      const messageTokens = new Set(tokens(message.content));
      let overlap = 0;
      for (const token of queryTokens) if (messageTokens.has(token)) overlap += 1;
      const score =
        overlap / Math.sqrt(Math.max(1, queryTokens.size) * Math.max(1, messageTokens.size));
      return { id: message.id, score };
    })
    .sort((left, right) => right.score - left.score)
    .map((item) => item.id);
}

async function directorySize(target: string): Promise<number> {
  try {
    const entries = await readdir(target, { withFileTypes: true });
    let total = 0;
    for (const entry of entries) {
      const full = path.join(target, entry.name);
      total += entry.isDirectory() ? await directorySize(full) : (await stat(full)).size;
    }
    return total;
  } catch {
    return 0;
  }
}

function summarize(
  ranks: string[][],
  queries: Query[],
): { recallAt1: number; recallAt5: number; mrr: number } {
  let hit1 = 0;
  let hit5 = 0;
  let reciprocal = 0;
  ranks.forEach((order, index) => {
    const relevant = new Set(queries[index]?.relevant ?? []);
    const top5 = order.slice(0, 5);
    if (top5.some((id) => relevant.has(id))) hit5 += 1;
    if (order[0] && relevant.has(order[0])) hit1 += 1;
    const first = order.findIndex((id) => relevant.has(id));
    if (first >= 0) reciprocal += 1 / (first + 1);
  });
  return {
    recallAt1: hit1 / queries.length,
    recallAt5: hit5 / queries.length,
    mrr: reciprocal / queries.length,
  };
}

const model = arg('model', 'Xenova/multilingual-e5-small');
const dataset = JSON.parse(
  await readFile(path.join(apiDir, 'test', 'ai', 'embedding-dataset.json'), 'utf8'),
) as Dataset;

const { env } = await import('@huggingface/transformers');
env.cacheDir = cacheDir;

const rssBefore = process.memoryUsage().rss;
const started = performance.now();
const embedder = new OnnxEmbedder(model);
const passages = await embedder.embed(
  dataset.messages.map((message) => message.content),
  'passage',
);
const coldStartMs = performance.now() - started;
const rssAfter = process.memoryUsage().rss;

// Đo lại batch khi model đã nằm trong RAM để tách thời gian tải model khỏi thời gian suy luận.
const batchStarted = performance.now();
await embedder.embed(
  dataset.messages.map((message) => message.content),
  'passage',
);
const passageBatchMs = performance.now() - batchStarted;

const queryVectors: number[][] = [];
const queryLatencies: number[] = [];
for (const query of dataset.queries) {
  const queryStarted = performance.now();
  const batch = await embedder.embed([query.query], 'query');
  queryLatencies.push(performance.now() - queryStarted);
  queryVectors.push(batch.vectors[0] ?? []);
}

const ids = dataset.messages.map((message) => message.id);
const vectorRanks = queryVectors.map((vector) => rank(passages.vectors, vector, ids));
const lexicalRanks = dataset.queries.map((query) => lexicalRank(query.query, dataset.messages));

const result = {
  generatedAt: new Date().toISOString(),
  model,
  runtime: {
    node: process.version,
    platform: `${process.platform}/${process.arch}`,
    cpu: process.env.PROCESSOR_IDENTIFIER ?? 'unknown',
  },
  corpus: {
    messages: dataset.messages.length,
    queries: dataset.queries.length,
    channels: new Set(dataset.messages.map((message) => message.channel)).size,
  },
  embedding: {
    dimensions: passages.dimensions,
    coldStartMs: Math.round(coldStartMs),
    passageBatchMs: Math.round(passageBatchMs),
    queryLatencyMs: {
      p50: Number(percentile(queryLatencies, 50).toFixed(1)),
      p95: Number(percentile(queryLatencies, 95).toFixed(1)),
    },
    rssBeforeMb: Number((rssBefore / 1024 / 1024).toFixed(1)),
    rssAfterMb: Number((rssAfter / 1024 / 1024).toFixed(1)),
    modelCacheMb: Number(
      ((await directorySize(path.join(cacheDir, model))) / 1024 / 1024).toFixed(1),
    ),
  },
  quality: {
    vector: summarize(vectorRanks, dataset.queries),
    lexical: summarize(lexicalRanks, dataset.queries),
  },
  perQuery: dataset.queries.map((query, index) => ({
    id: query.id,
    query: query.query,
    relevant: query.relevant,
    vectorTop5: vectorRanks[index]?.slice(0, 5),
    lexicalTop5: lexicalRanks[index]?.slice(0, 5),
  })),
};

const outDir = path.join(repoRoot, 'docs', 'v0.2.0', 'evidence', 'T5.1');
await mkdir(outDir, { recursive: true });
const slug = model.replace(/[^a-z0-9]+/gi, '__');
const suffix = arg('suffix', '');
const outFile = path.join(outDir, `embedding-eval.${slug}${suffix ? `.${suffix}` : ''}.json`);
await writeFile(outFile, `${JSON.stringify(result, null, 2)}\n`, 'utf8');

console.log(
  JSON.stringify(
    {
      model,
      dimensions: result.embedding.dimensions,
      coldStartMs: result.embedding.coldStartMs,
      queryP50: result.embedding.queryLatencyMs.p50,
      queryP95: result.embedding.queryLatencyMs.p95,
      rssAfterMb: result.embedding.rssAfterMb,
      modelCacheMb: result.embedding.modelCacheMb,
      recallAt5: result.quality.vector.recallAt5,
      mrr: result.quality.vector.mrr,
      lexicalRecallAt5: result.quality.lexical.recallAt5,
      outFile: path.relative(repoRoot, outFile),
    },
    null,
    2,
  ),
);
