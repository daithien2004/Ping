import { Logger, type INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Redis } from 'ioredis';
import { ServerOptions, type Server } from 'socket.io';
import { warnRedisDown } from '../redis/redis-policy.js';

/**
 * @socket.io/redis-adapter gọi `pubClient.publish(...)` mà KHÔNG await và không bắt lỗi. Redis chết
 * thì lệnh bị từ chối → unhandled rejection → Node thoát. Bọc `publish` để lỗi chỉ được log:
 * event không tới instance khác (suy giảm có kiểm soát, ADR-0026), tiến trình vẫn sống.
 */
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

/**
 * Socket.IO đa instance: pub/sub qua Redis để `emit` từ instance A đến được
 * client đang nối instance B. Cần HAI kết nối riêng (pub và sub) vì Redis
 * không cho một connection vừa subscribe vừa chạy lệnh thường.
 *
 * Truyền `app` vào super() để Socket.IO gắn vào HTTP server có sẵn — client
 * websocket nối cùng cổng REST, không mở thêm cổng riêng.
 *
 * CORS lấy từ ConfigService ở main.ts (đã validate), không đọc process.env trong
 * decorator của gateway — decorator chạy lúc import, trước khi .env được nạp.
 */
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
      // Socket chỉ mang gói rất nhỏ (join/leave/typing, ack); tin nhắn đi qua REST. 16 KB đủ rộng
      // và chặn kẻ gửi gói khổng lồ (mặc định của Socket.IO là 1 MB). Vượt thì Socket.IO tự đóng kết nối.
      maxHttpBufferSize: 16 * 1024,
    };
    const server = super.createIOServer(port, withCors as ServerOptions) as unknown as Server;
    const adapter = createAdapter(
      withSafePublish(this.pubClient, this.policyLogger),
      this.subClient,
    );
    (server as unknown as { adapter: (a: unknown) => void }).adapter(adapter);
    return server;
  }

  /** pubClient là RedisProvider (tự đóng khi shutdown); subClient do main.ts duplicate ra thì adapter tự đóng. */
  async dispose(): Promise<void> {
    await this.subClient.quit();
  }
}
