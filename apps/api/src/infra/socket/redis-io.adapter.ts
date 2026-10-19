import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Redis } from 'ioredis';
import { ServerOptions, type Server } from 'socket.io';

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
  constructor(
    app: INestApplicationContext,
    private readonly pubClient: Redis,
    private readonly subClient: Redis,
    private readonly corsOrigin: string,
  ) {
    super(app);
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const withCors = { ...options, cors: { origin: this.corsOrigin, credentials: true } };
    const server = super.createIOServer(port, withCors as ServerOptions) as unknown as Server;
    const adapter = createAdapter(this.pubClient, this.subClient);
    (server as unknown as { adapter: (a: unknown) => void }).adapter(adapter);
    return server;
  }

  /** pubClient là RedisProvider (tự đóng khi shutdown); subClient do main.ts duplicate ra thì adapter tự đóng. */
  async dispose(): Promise<void> {
    await this.subClient.quit();
  }
}
