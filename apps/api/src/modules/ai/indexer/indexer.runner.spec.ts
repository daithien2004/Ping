import type { Redis } from 'ioredis';
import { describe, expect, it } from 'vitest';
import { IndexerRunner, INDEXER_GROUP, INDEXER_STREAM } from './indexer.runner.js';
import type { MessageIndexerCore } from './message-indexer.core.js';

interface FakeEntry {
  streamId: string;
  event: Record<string, unknown>;
}

function fakeRedis(entries: FakeEntry[]) {
  const handled: string[] = [];
  const acked: string[] = [];
  let reads = 0;
  let lagCallback: number | undefined;
  let pendingCount = 0;

  const redis = {
    async xgroup() {
      throw new Error('BUSYGROUP Consumer Group name already exists');
    },
    async call(command: string) {
      if (command === 'XAUTOCLAIM') return ['0-0', [], []] as unknown;
      if (command === 'XPENDING') return [pendingCount] as unknown;
      if (command === 'XINFO') {
        return [
          [
            'name',
            INDEXER_GROUP,
            'consumers',
            1,
            'pending',
            pendingCount,
            'last-delivered-id',
            '0-0',
            'entries-read',
            0,
            'lag',
            3,
          ],
        ] as unknown;
      }
      throw new Error(`unexpected call ${command}`);
    },
    async xreadgroup() {
      reads += 1;
      if (reads > 1) {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return null;
      }
      return [
        [
          INDEXER_STREAM,
          entries.map((entry) => [entry.streamId, Object.entries(entry.event).flat()]),
        ],
      ] as unknown;
    },
    async xack(_stream: string, _group: string, id: string) {
      acked.push(id);
      return 1;
    },
  };

  return {
    redis: redis as unknown as Redis,
    handled,
    acked,
    setPending: (value: number) => {
      pendingCount = value;
    },
    onLag: (value: number) => {
      lagCallback = value;
    },
    lastLag: () => lagCallback,
  };
}

function fakeCore(handled: string[], failOn?: string): MessageIndexerCore {
  return {
    async handleEvent(_type: string, messageId: string) {
      if (messageId === failOn) throw new Error('embedding failed');
      handled.push(messageId);
    },
  } as unknown as MessageIndexerCore;
}

const event = (id: string, type = 'message.created') => ({
  type,
  payload: JSON.stringify({ id }),
});

describe('IndexerRunner', () => {
  it('chỉ XACK sau khi xử lý xong, bỏ qua event không phải message', async () => {
    const fake = fakeRedis([
      { streamId: '1-0', event: event('m1') },
      { streamId: '2-0', event: event('ignored', 'server.updated') },
      { streamId: '3-0', event: event('m2') },
    ]);
    const handled: string[] = [];
    const runner = new IndexerRunner(fake.redis, fakeCore(handled), {
      consumer: 'test',
      onLag: fake.onLag,
    });

    runner.start();
    await waitFor(() => fake.acked.length === 3);
    await runner.stop();

    expect(handled).toEqual(['m1', 'm2']);
    expect(fake.acked).toEqual(['1-0', '2-0', '3-0']);
  });

  it('không XACK khi xử lý lỗi để entry ở lại pending', async () => {
    const fake = fakeRedis([{ streamId: '1-0', event: event('boom') }]);
    const runner = new IndexerRunner(fake.redis, fakeCore([], 'boom'), {
      consumer: 'test',
      onLag: fake.onLag,
    });

    runner.start();
    await waitFor(() => fake.lastLag() !== undefined);
    await runner.stop();

    expect(fake.acked).toEqual([]);
  });

  it('báo lag = lag của nhóm + pending để metric consumer_lag phản ánh việc chưa xử lý xong', async () => {
    const fake = fakeRedis([]);
    fake.setPending(2);
    const runner = new IndexerRunner(fake.redis, fakeCore([]), {
      consumer: 'test',
      onLag: fake.onLag,
    });

    runner.start();
    await waitFor(() => fake.lastLag() === 5);
    await runner.stop();

    expect(fake.lastLag()).toBe(5);
  });
});

async function waitFor(done: () => boolean, timeoutMs = 2_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!done()) {
    if (Date.now() > deadline) throw new Error('timeout waiting for runner');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
