import type { PrismaService } from '../../infra/prisma/prisma.service.js';
import type { RedisProvider } from '../../infra/redis/redis.module.js';
import type { AbilityFactory } from '../ability/ability.factory.js';
import { describe, expect, it, vi } from 'vitest';
import { RealtimeService } from './realtime.service.js';

function setup(redisUp: boolean) {
  const everywhere = vi.fn().mockRejectedValue(new Error('would wait for other instances'));
  const local = vi.fn().mockResolvedValue([{}, {}]); // 2 socket trên instance này
  const server = { in: () => ({ fetchSockets: everywhere, local: { fetchSockets: local } }) };
  const service = new RealtimeService(
    {} as PrismaService,
    {} as AbilityFactory,
    { isUp: redisUp } as RedisProvider,
  );
  service.attach(server as never);
  return { service, everywhere, local };
}

describe('RealtimeService.countUserSockets', () => {
  it('counts only this instance while Redis is down, without waiting for other instances', async () => {
    const { service, everywhere, local } = setup(false);
    await expect(service.countUserSockets('u')).resolves.toBe(2);
    expect(local).toHaveBeenCalledOnce();
    expect(everywhere).not.toHaveBeenCalled();
  });

  it('asks every instance when Redis is up', async () => {
    const { service, everywhere } = setup(true);
    await expect(service.countUserSockets('u')).rejects.toThrow('would wait');
    expect(everywhere).toHaveBeenCalledOnce();
  });
});
