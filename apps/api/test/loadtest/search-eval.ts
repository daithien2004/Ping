/**
 * S3: so FTS (Postgres, như search.service.ts), vector qua Qdrant, vector qua pgvector, và kết hợp RRF trên tập tin nhắn
 * có nhãn (experiments/s3-search/corpus.mjs). Tập nhỏ có chủ đích: kết quả là MINH HỌA, không đủ thống kê.
 *   pnpm --filter api loadtest:search
 * Cần: docker compose up -d (Postgres, Qdrant), mô hình embedding có trong cache của @huggingface/transformers,
 * và image pgvector/pgvector:pg17 (container tạm, cổng 5545).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { OnnxEmbedder } from '../../src/modules/ai/onnx-embedder.js';
import {
  EXACT_QUERIES,
  SEMANTIC_QUERIES,
  TOPICS,
} from '../../../../experiments/s3-search/corpus.mjs';

const repoRoot = path.resolve(fileURLToPath(new URL('../../../..', import.meta.url)));
process.loadEnvFile(path.join(repoRoot, '.env'));
const MODEL = process.env.EMBEDDING_MODEL || 'Xenova/multilingual-e5-small';
const QDRANT = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333';
const COLLECTION = `ping_s3_${Date.now().toString(36)}`;
const K = 10;
const docker = (...a: string[]) => execFileSync('docker', a, { encoding: 'utf8' }).trim();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Doc = { id: number; topic: string; text: string };
const docs: Doc[] = Object.entries(TOPICS).flatMap(([topic, texts], t) =>
  texts.map((text, i) => ({ id: t * 100 + i, topic, text })),
);
const semantic = SEMANTIC_QUERIES.map(([q, topic]) => ({
  q,
  relevant: new Set(docs.filter((d) => d.topic === topic).map((d) => d.id)),
}));
const exact = EXACT_QUERIES.map(([q, needle]) => ({
  q,
  relevant: new Set(docs.filter((d) => d.text.includes(needle)).map((d) => d.id)),
}));

// --- embeddings
const embedder = new OnnxEmbedder(MODEL);
const t0 = Date.now();
const docVectors = (
  await embedder.embed(
    docs.map((d) => d.text),
    'passage',
  )
).vectors;
const dims = docVectors[0]!.length;
const embedMs = Date.now() - t0;
const queryVector = async (q: string) => (await embedder.embed([q], 'query')).vectors[0]!;

// --- Postgres cho FTS (CSDL tạm trong Postgres dev)
const base = new URL(process.env.DATABASE_URL!);
const dbUrl = (name: string) => {
  const u = new URL(base);
  u.pathname = `/${name}`;
  return u.toString();
};
const admin = new pg.Client({ connectionString: dbUrl('postgres') });
await admin.connect();
await admin.query('DROP DATABASE IF EXISTS ping_s3 WITH (FORCE)');
await admin.query('CREATE DATABASE ping_s3');
await admin.end();
const fts = new pg.Client({ connectionString: dbUrl('ping_s3') });
await fts.connect();
await fts.query(`CREATE EXTENSION IF NOT EXISTS unaccent; CREATE EXTENSION IF NOT EXISTS pg_trgm;
  CREATE FUNCTION f_unaccent(text) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT public.unaccent('public.unaccent', $1) $$;
  CREATE TABLE docs (id int PRIMARY KEY, content text NOT NULL,
    search tsvector GENERATED ALWAYS AS (to_tsvector('simple', f_unaccent(content))) STORED);
  CREATE INDEX ON docs USING GIN (search);
  CREATE INDEX ON docs USING GIN (f_unaccent(content) gin_trgm_ops);`);
for (const d of docs)
  await fts.query('INSERT INTO docs (id, content) VALUES ($1, $2)', [d.id, d.text]);

async function ftsSearch(q: string): Promise<number[]> {
  const { rows } = await fts.query(
    `SELECT id FROM docs
     WHERE search @@ websearch_to_tsquery('simple', f_unaccent($1))
        OR f_unaccent(content) ILIKE ('%' || f_unaccent($1) || '%')
     ORDER BY ts_rank_cd(search, websearch_to_tsquery('simple', f_unaccent($1))) DESC, id LIMIT ${K}`,
    [q],
  );
  return rows.map((r) => r.id as number);
}

// --- Qdrant (REST)
const qd = async (method: string, route: string, body?: unknown) => {
  const res = await fetch(`${QDRANT}${route}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`qdrant ${method} ${route}: ${res.status} ${await res.text()}`);
  return res.json() as Promise<{ result: unknown }>;
};
await qd('PUT', `/collections/${COLLECTION}`, { vectors: { size: dims, distance: 'Cosine' } });
await qd('PUT', `/collections/${COLLECTION}/points?wait=true`, {
  points: docs.map((d, i) => ({ id: d.id, vector: docVectors[i], payload: { topic: d.topic } })),
});
async function qdrantSearch(vector: number[]): Promise<number[]> {
  const { result } = (await qd('POST', `/collections/${COLLECTION}/points/search`, {
    vector,
    limit: K,
  })) as { result: { id: number }[] };
  return result.map((r) => r.id);
}

// --- pgvector (container tạm)
const PGV = 'ping-s3-pgvector';
spawnSync('docker', ['rm', '-f', PGV]);
docker(
  'run',
  '-d',
  '--name',
  PGV,
  '-p',
  '127.0.0.1:5545:5432',
  '-e',
  'POSTGRES_PASSWORD=ping',
  'pgvector/pgvector:pg17',
);
let pgv: pg.Client | undefined;
for (let i = 0; i < 60 && !pgv; i++) {
  const c = new pg.Client({
    connectionString: 'postgresql://postgres:ping@127.0.0.1:5545/postgres',
  });
  try {
    await c.connect();
    await c.query('select 1');
    pgv = c;
  } catch {
    await c.end().catch(() => undefined);
    await sleep(1000);
  }
}
if (!pgv) throw new Error('pgvector container not ready');
await pgv.query(
  `CREATE EXTENSION vector; CREATE TABLE docs (id int PRIMARY KEY, embedding vector(${dims}));`,
);
const literal = (v: number[]) => `[${v.join(',')}]`;
for (const [i, d] of docs.entries()) {
  await pgv.query('INSERT INTO docs (id, embedding) VALUES ($1, $2::vector)', [
    d.id,
    literal(docVectors[i]!),
  ]);
}
await pgv.query('CREATE INDEX ON docs USING hnsw (embedding vector_cosine_ops)');
async function pgvectorSearch(vector: number[]): Promise<number[]> {
  const { rows } = await pgv!.query(
    `SELECT id FROM docs ORDER BY embedding <=> $1::vector LIMIT ${K}`,
    [literal(vector)],
  );
  return rows.map((r) => r.id as number);
}

// --- RRF
function rrf(...lists: number[][]): number[] {
  const score = new Map<number, number>();
  for (const list of lists)
    list.forEach((id, rank) => score.set(id, (score.get(id) ?? 0) + 1 / (60 + rank + 1)));
  return [...score]
    .sort((a, b) => b[1] - a[1])
    .map(([id]) => id)
    .slice(0, K);
}

// --- đánh giá
type Run = (q: string, v: number[]) => Promise<number[]>;
const engines: Record<string, Run> = {
  fts: (q) => ftsSearch(q),
  qdrant: (_q, v) => qdrantSearch(v),
  pgvector: (_q, v) => pgvectorSearch(v),
  hybrid_fts_qdrant: async (q, v) => rrf(await ftsSearch(q), await qdrantSearch(v)),
};

const stats = (relevant: Set<number>, ranked: number[]) => {
  const top5 = ranked.slice(0, 5);
  const firstHit = ranked.findIndex((id) => relevant.has(id));
  return {
    precision5: top5.filter((id) => relevant.has(id)).length / Math.min(5, ranked.length || 1),
    hit1: ranked[0] !== undefined && relevant.has(ranked[0]) ? 1 : 0,
    mrr: firstHit === -1 ? 0 : 1 / (firstHit + 1),
  };
};
const mean = (xs: number[]) => +(xs.reduce((a, b) => a + b, 0) / xs.length).toFixed(3);

const result: Record<string, unknown> = {
  model: MODEL,
  dims,
  corpusSize: docs.length,
  queries: { semantic: semantic.length, exact: exact.length },
  embedCorpusMs: embedMs,
  engines: {} as Record<string, unknown>,
};
const vectors = new Map<string, number[]>();
for (const item of [...semantic, ...exact]) vectors.set(item.q, await queryVector(item.q));

for (const [name, run] of Object.entries(engines)) {
  const latency: number[] = [];
  const evaluate = async (items: typeof semantic) => {
    const all = [];
    for (const item of items) {
      const started = process.hrtime.bigint();
      const ranked = await run(item.q, vectors.get(item.q)!);
      latency.push(Number(process.hrtime.bigint() - started) / 1e6);
      all.push(stats(item.relevant, ranked));
    }
    return {
      precision5: mean(all.map((s) => s.precision5)),
      hit1: mean(all.map((s) => s.hit1)),
      mrr: mean(all.map((s) => s.mrr)),
    };
  };
  for (const item of [...semantic, ...exact]) await run(item.q, vectors.get(item.q)!); // khởi động nguội
  latency.length = 0;
  (result.engines as Record<string, unknown>)[name] = {
    semantic: await evaluate(semantic),
    exact: await evaluate(exact),
    avgQueryMs: mean(latency),
  };
}

console.log(JSON.stringify(result, null, 2));
await fts.end();
await pgv.end();
spawnSync('docker', ['rm', '-f', PGV]);
await qd('DELETE', `/collections/${COLLECTION}`).catch(() => undefined);
const cleanup = new pg.Client({ connectionString: dbUrl('postgres') });
await cleanup.connect();
await cleanup.query('DROP DATABASE IF EXISTS ping_s3 WITH (FORCE)');
await cleanup.end();
process.exit(0);
