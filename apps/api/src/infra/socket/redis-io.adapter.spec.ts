import { Logger } from '@nestjs/common';
import type { Redis } from 'ioredis';
import { describe, expect, it, vi } from 'vitest';
import { withSafePublish } from './redis-io.adapter.js';

describe('withSafePublish', () => {
  const logger = new Logger('test');

  it('turns a rejected publish into 0 instead of an unhandled rejection', async () => {
    const publish = vi.fn().mockRejectedValue(new Error('Connection is closed'));
    const safe = withSafePublish({ publish } as unknown as Redis, logger);
    await expect(safe.publish('channel', 'payload')).resolves.toBe(0);
    expect(publish).toHaveBeenCalledWith('channel', 'payload');
  });

  it('passes a successful publish through and keeps other methods bound to the client', async () => {
    const client = {
      subscribers: 3,
      publish: vi.fn().mockResolvedValue(2),
      on: vi.fn(function (this: unknown) {
        return this;
      }),
    };
    const safe = withSafePublish(client as unknown as Redis, logger);
    await expect(safe.publish('c', 'm')).resolves.toBe(2);
    safe.on('error', () => undefined);
    expect(client.on).toHaveBeenCalledOnce();
    expect(client.on.mock.contexts[0]).toBe(client); // không bị gọi với `this` là Proxy
  });
});
