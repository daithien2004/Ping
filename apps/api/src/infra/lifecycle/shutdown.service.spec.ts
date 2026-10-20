import type { ConfigService } from '@nestjs/config';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../../config/env.schema.js';
import { ShutdownService } from './shutdown.service.js';

const config = (graceMs: number, timeoutMs: number) =>
  ({
    getOrThrow: (key: string) =>
      ({ SHUTDOWN_GRACE_MS: graceMs, SHUTDOWN_TIMEOUT_MS: timeoutMs })[key],
  }) as unknown as ConfigService<Env, true>;

afterEach(() => vi.restoreAllMocks());

describe('ShutdownService', () => {
  it('does nothing for an explicit app.close() (no signal): tests and scripts do not wait', async () => {
    const service = new ShutdownService(config(5_000, 25_000));
    const started = Date.now();
    await service.beforeApplicationShutdown(undefined);
    expect(service.draining).toBe(false);
    expect(Date.now() - started).toBeLessThan(100);
  });

  it('on a signal: starts draining and waits SHUTDOWN_GRACE_MS so the load balancer can drop the instance', async () => {
    const service = new ShutdownService(config(120, 25_000));
    const started = Date.now();
    await service.beforeApplicationShutdown('SIGTERM');
    expect(service.draining).toBe(true);
    expect(Date.now() - started).toBeGreaterThanOrEqual(110);
    service.onApplicationShutdown(); // dọn watchdog
  });

  it('forces exit(1) when the whole shutdown exceeds SHUTDOWN_TIMEOUT_MS', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const service = new ShutdownService(config(0, 60));
    await service.beforeApplicationShutdown('SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(exit).toHaveBeenCalledWith(1);
  });

  it('does not force exit once shutdown has finished', async () => {
    const exit = vi.spyOn(process, 'exit').mockImplementation((() => undefined) as never);
    const service = new ShutdownService(config(0, 60));
    await service.beforeApplicationShutdown('SIGTERM');
    service.onApplicationShutdown();
    await new Promise((resolve) => setTimeout(resolve, 120));
    expect(exit).not.toHaveBeenCalled();
  });
});
