/**
 * Gửi tin có nonce qua BASE_URL (thường là Nginx trước nhiều instance) trong lúc instance bị restart, rồi đối chiếu:
 * tin nào server đã lưu, tin nào listener nhận trực tiếp, và phần còn thiếu có vá được bằng cursor `after` không.
 *   BASE_URL=http://127.0.0.1:8081 DURATION_S=90 RATE=20 LISTENERS=40 pnpm --filter api loadtest:rolling
 */
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { io, type Socket } from 'socket.io-client';

type Token = { userId: string; token: string };
type Message = { id: string; content: string; nonce: string | null };
type Page = { messages: Message[]; hasMore: boolean };

const repoRoot = path.resolve(fileURLToPath(new URL('../../../..', import.meta.url)));
const dataDir = path.join(repoRoot, 'tools/loadtest/data');
const tokens = JSON.parse(readFileSync(path.join(dataDir, 'tokens.json'), 'utf8')) as Token[];
const meta = JSON.parse(readFileSync(path.join(dataDir, 'meta.json'), 'utf8')) as {
  channels: { id: string }[];
};

const BASE_URL = (process.env.BASE_URL ?? 'http://127.0.0.1:8081').replace(/\/+$/, '');
const DURATION_S = Number(process.env.DURATION_S ?? 90);
const RATE = Number(process.env.RATE ?? 20);
const LISTENERS = Number(process.env.LISTENERS ?? 40);
const SENDERS = Number(process.env.SENDERS ?? 60);
const OUT = process.env.OUT ? path.resolve(repoRoot, process.env.OUT) : undefined;
const MAX_ATTEMPTS = 6;
const channelId = meta.channels.at(-1)!.id;
const runId = randomUUID().slice(0, 8);
const startedAt = Date.now();
const rel = () => Math.round((Date.now() - startedAt) / 100) / 10;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const auth = (index: number) => ({
  Authorization: `Bearer ${tokens[index]!.token}`,
  'Content-Type': 'application/json',
});

const confirmed = new Map<string, { id: string; attempts: number }>();
const statusHistogram = new Map<string, number>();
const firstError: { at?: number; last?: number } = {};
let unconfirmed = 0;
let inFlight = 0;

function countOutcome(key: string) {
  statusHistogram.set(key, (statusHistogram.get(key) ?? 0) + 1);
  if (key !== '201' && key !== '200') {
    firstError.at ??= rel();
    firstError.last = rel();
  }
}

async function sendOne(senderIndex: number) {
  const nonce = randomUUID();
  const body = JSON.stringify({ content: `RR|${runId}|${nonce}`, nonce });
  inFlight++;
  try {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const response = await fetch(`${BASE_URL}/api/v1/channels/${channelId}/messages`, {
          method: 'POST',
          headers: auth(senderIndex),
          body,
          signal: AbortSignal.timeout(5000),
        });
        countOutcome(String(response.status));
        if (response.status === 201 || response.status === 200) {
          const created = (await response.json()) as Message;
          confirmed.set(nonce, { id: created.id, attempts: attempt });
          return;
        }
        if (response.status !== 502 && response.status !== 503 && response.status !== 504) {
          unconfirmed++;
          return;
        }
      } catch {
        countOutcome('network');
      }
      await sleep(300 * attempt);
    }
    unconfirmed++;
  } finally {
    inFlight--;
  }
}

type Listener = {
  socket: Socket;
  live: Set<string>;
  liveDuplicates: number;
  lastId: string;
  lastIdAtDown?: string;
  gap: Set<string>;
  gapFetches: Promise<void>[];
  downAt?: number;
  rejoinMs: number[];
};

function startListener(index: number): Promise<Listener> {
  return new Promise((resolve) => {
    const socket = io(BASE_URL, {
      transports: ['websocket'],
      auth: { token: tokens[index]!.token },
      reconnectionDelay: 500,
      reconnectionDelayMax: 3000,
    });
    const listener: Listener = {
      socket,
      live: new Set(),
      liveDuplicates: 0,
      lastId: '00000000-0000-7000-8000-000000000000',
      gap: new Set(),
      gapFetches: [],
      rejoinMs: [],
    };
    let first = true;
    socket.on('connect_error', (error) => {
      if (index === 0) console.error(`[${rel()}s] listener connect_error: ${error.message}`);
    });
    socket.on('connect', () => {
      socket.emit('channel.join', { channelId }, () => {
        if (listener.downAt !== undefined) {
          listener.rejoinMs.push(Date.now() - listener.downAt);
          listener.downAt = undefined;
        }
        // Như client thật (ADR-0044): nối lại thì vá khoảng hở từ cursor của tin cuối trước khi mất kết nối.
        if (listener.lastIdAtDown !== undefined) {
          const after = listener.lastIdAtDown;
          listener.lastIdAtDown = undefined;
          listener.gapFetches.push(
            recovered(index, after).then((ids) => {
              for (const id of ids) listener.gap.add(id);
            }),
          );
        }
        if (first) {
          first = false;
          resolve(listener);
        }
      });
    });
    socket.on('disconnect', () => {
      listener.downAt ??= Date.now();
      listener.lastIdAtDown ??= listener.lastId;
    });
    socket.on('message.created', (message: Message) => {
      if (!message.content.startsWith(`RR|${runId}|`)) return;
      if (listener.live.has(message.id)) listener.liveDuplicates++;
      listener.live.add(message.id);
      if (message.id > listener.lastId) listener.lastId = message.id;
    });
  });
}

async function listPage(index: number, query: string): Promise<Page> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await fetch(`${BASE_URL}/api/v1/channels/${channelId}/messages?${query}`, {
      headers: auth(index),
    });
    if (response.ok) return (await response.json()) as Page;
    if (response.status === 429) {
      await sleep(Number(response.headers.get('retry-after') ?? 2) * 1000);
      continue;
    }
    throw new Error(`list failed ${response.status}`);
  }
  throw new Error('list kept returning 429');
}

async function recovered(index: number, after: string): Promise<Set<string>> {
  const ids = new Set<string>();
  let cursor = after;
  for (;;) {
    const page = await listPage(index, `after=${cursor}&limit=100`);
    for (const message of page.messages) {
      if (message.content.startsWith(`RR|${runId}|`)) ids.add(message.id);
      if (message.id > cursor) cursor = message.id;
    }
    if (!page.hasMore || page.messages.length === 0) return ids;
  }
}

const quantile = (values: number[], q: number) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length === 0
    ? null
    : sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
};

async function main() {
  const listeners = await Promise.all(
    Array.from({ length: LISTENERS }, (_, i) => startListener(i)),
  );
  console.log(
    `[${rel()}s] ${listeners.length} listeners joined; sending ${RATE}/s for ${DURATION_S}s`,
  );

  let senderCursor = 0;
  const timer = setInterval(() => {
    void sendOne(tokens.length - 1 - (senderCursor++ % SENDERS));
  }, 1000 / RATE);
  await sleep(DURATION_S * 1000);
  clearInterval(timer);
  while (inFlight > 0) await sleep(100);
  await sleep(8000);
  console.log(`[${rel()}s] sending finished; verifying`);

  const confirmedIds = new Set([...confirmed.values()].map((entry) => entry.id));
  const serverIds = new Map<string, string>();
  const serverNonces = new Map<string, number>();
  let cursor: string | undefined;
  for (;;) {
    const page = await listPage(0, cursor ? `before=${cursor}&limit=100` : 'limit=100');
    for (const message of page.messages) {
      if (message.content.startsWith(`RR|${runId}|`)) {
        serverIds.set(message.id, message.content);
        serverNonces.set(message.content, (serverNonces.get(message.content) ?? 0) + 1);
      }
      if (cursor === undefined || message.id < cursor) cursor = message.id;
    }
    if (!page.hasMore || page.messages.length === 0) break;
  }

  const liveRatios: number[] = [];
  const afterRatios: number[] = [];
  let liveDuplicates = 0;
  const rejoin: number[] = [];
  for (const [i, listener] of listeners.entries()) {
    const live = [...confirmedIds].filter((id) => listener.live.has(id)).length;
    liveRatios.push(live / confirmedIds.size);
    await Promise.all(listener.gapFetches);
    const patched = await recovered(i, listener.lastId);
    for (const id of listener.gap) patched.add(id);
    const union = [...confirmedIds].filter((id) => listener.live.has(id) || patched.has(id)).length;
    afterRatios.push(union / confirmedIds.size);
    liveDuplicates += listener.liveDuplicates;
    rejoin.push(...listener.rejoinMs);
    listener.socket.close();
  }

  const retried = [...confirmed.values()].filter((entry) => entry.attempts > 1).length;
  const result = {
    runId,
    baseUrl: BASE_URL,
    durationS: DURATION_S,
    rate: RATE,
    listeners: LISTENERS,
    sent: confirmed.size + unconfirmed,
    confirmed: confirmed.size,
    confirmedAfterRetry: retried,
    unconfirmed,
    statusHistogram: Object.fromEntries(statusHistogram),
    errorWindowS: firstError,
    serverStored: serverIds.size,
    confirmedMissingOnServer: [...confirmedIds].filter((id) => !serverIds.has(id)).length,
    storedButUnconfirmed: [...serverIds.keys()].filter((id) => !confirmedIds.has(id)).length,
    duplicateNoncesOnServer: [...serverNonces.values()].filter((n) => n > 1).length,
    liveDeliveryRatio: { min: Math.min(...liveRatios), p50: quantile(liveRatios, 0.5) },
    afterGapRecoveryRatio: { min: Math.min(...afterRatios), p50: quantile(afterRatios, 0.5) },
    liveDuplicates,
    listenersThatReconnected: listeners.filter((l) => l.rejoinMs.length > 0).length,
    rejoinMs: { p50: quantile(rejoin, 0.5), p95: quantile(rejoin, 0.95), max: quantile(rejoin, 1) },
  };
  console.log(JSON.stringify(result, null, 2));
  if (OUT) writeFileSync(OUT, JSON.stringify(result, null, 2));
}

await main();
process.exit(0);
