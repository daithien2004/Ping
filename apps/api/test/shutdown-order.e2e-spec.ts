import { describe, expect, it, vi } from 'vitest';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { RedisProvider } from '../src/infra/redis/redis.module.js';
import { bootApp } from './helpers/boot.js';

/**
 * Thứ tự tắt (ADR-0026, sửa O1): server HTTP và Socket.IO đóng TRƯỚC, Redis và Postgres đóng SAU.
 * Trước đây Redis đóng ở onModuleDestroy (đầu tiên) và Prisma ở beforeApplicationShutdown, nên
 * request/socket đang dở mất kết nối ngay khi bắt đầu tắt.
 */
describe('shutdown order (e2e)', () => {
  it('closes the HTTP server before Redis and Postgres', async () => {
    const app = await bootApp();
    const order: string[] = [];
    const http = app.getHttpServer();
    const closeHttp = http.close.bind(http);
    vi.spyOn(http, 'close').mockImplementation(((callback?: (error?: Error) => void) => {
      order.push('http');
      return closeHttp(callback);
    }) as typeof http.close);
    const redis = app.get(RedisProvider);
    const quit = redis.quit.bind(redis);
    vi.spyOn(redis, 'quit').mockImplementation(() => {
      order.push('redis');
      return quit();
    });
    const prisma = app.get(PrismaService);
    const disconnect = prisma.$disconnect.bind(prisma);
    vi.spyOn(prisma, '$disconnect').mockImplementation(() => {
      order.push('postgres');
      return disconnect();
    });

    await app.init();
    await app.listen(0);
    await app.close();

    // http.close có thể gọi nhiều lần (Socket.IO rồi Nest): lấy lần CUỐI.
    const lastHttp = order.lastIndexOf('http');
    expect(lastHttp).toBeGreaterThanOrEqual(0);
    expect(order.indexOf('redis')).toBeGreaterThan(lastHttp);
    expect(order.indexOf('postgres')).toBeGreaterThan(lastHttp);
  });
});
