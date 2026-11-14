import { Logger, type INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Redis } from 'ioredis';
import { ServerOptions, type Server } from 'socket.io';
import { warnRedisDown } from '../redis/redis-policy.js';

// redis-adapter gọi publish không await/bắt lỗi: Redis chết → unhandled rejection → Node thoát. Bọc để chỉ log.
export function withSafePublish(client: Redis, logger: Logger): Redis {
  return new Proxy(client, {
    get(target, property) {
      const value: unknown = Reflect.get(target, property, target);
      if (typeof value !== 'function') {
        return value;
      }
      if (property === 'publish') {
        return (...args: unknown[]) =>
          (value.apply(target, args) as Promise<number>).catch((error: unknown) => {
            warnRedisDown(logger, 'socket-publish', error);
            return 0;
          });
      }
      return value.bind(target) as unknown;
    },
  });
}

// Cần hai kết nối pub/sub riêng: một connection Redis không vừa subscribe vừa chạy lệnh thường.
// CORS lấy từ ConfigService, không đọc process.env trong decorator: decorator chạy lúc import, trước khi .env nạp.
export class RedisIoAdapter extends IoAdapter {
  private readonly policyLogger = new Logger(RedisIoAdapter.name);

  constructor(
    app: INestApplicationContext,
    private readonly pubClient: Redis,
    private readonly subClient: Redis,
    private readonly corsOrigin: string,
  ) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const withCors = {
      ...options,
      cors: { origin: this.corsOrigin, credentials: true },
      // Gói socket rất nhỏ; 4 KB chặn gói khổng lồ (mặc định Socket.IO 1 MB).
      maxHttpBufferSize: 4 * 1024,
    };
    const server = super.createIOServer(port, withCors as ServerOptions) as unknown as Server;
    const adapter = createAdapter(
      withSafePublish(this.pubClient, this.policyLogger),
      this.subClient,
    );
    (server as unknown as { adapter: (a: unknown) => void }).adapter(adapter);
    return server;
  }

  // pubClient là RedisProvider (tự đóng khi shutdown); subClient do adapter tự đóng.
  async dispose(): Promise<void> {
    await this.subClient.quit();
  }
}
