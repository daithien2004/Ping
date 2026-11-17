import { DynamicModule, Global, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { createAdapter } from '@socket.io/redis-adapter';
import { Server } from 'socket.io';
import { RedisProvider } from '../../infra/redis/redis.module.js';
import { withSafePublish } from '../../infra/socket/redis-io.adapter.js';
import { RealtimeGateway } from './realtime.gateway.js';
import { RealtimeService } from './realtime.service.js';

/**
 * Tiến trình `api` không giữ socket nào: nó dựng một Server Socket.IO không cổng nhưng dùng cùng Redis adapter, nên
 * `to().emit()`, `fetchSockets()` và `socketsLeave()` vẫn tới socket nằm ở các tiến trình `gateway` (ADR-0098).
 */
class HeadlessSocketServer implements OnApplicationShutdown {
  private readonly logger = new Logger(HeadlessSocketServer.name);
  private readonly sub;
  readonly server: Server;

  constructor(redis: RedisProvider, realtime: RealtimeService) {
    this.sub = redis.duplicate();
    this.server = new Server();
    this.server.adapter(createAdapter(withSafePublish(redis, this.logger), this.sub));
    realtime.attach(this.server);
  }

  async onApplicationShutdown(): Promise<void> {
    // Server không gắn HTTP nên `server.close()` ném lỗi; chỉ cần ngừng nghe kênh Redis.
    await (this.server.of('/').adapter as { close?: () => Promise<void> | void }).close?.();
    await this.sub.quit().catch(() => undefined);
  }
}

@Global()
@Module({})
export class RealtimeModule {
  // Đọc vai trò lúc dựng module (sau ConfigModule.forRoot đã nạp .env), không lúc import file.
  static forRoot(role = process.env.REALTIME_ROLE ?? 'all'): DynamicModule {
    const gateway = role === 'all' || role === 'gateway';
    return {
      module: RealtimeModule,
      providers: [
        RealtimeService,
        ...(gateway ? [RealtimeGateway] : []),
        ...(role === 'api'
          ? [
              {
                provide: HeadlessSocketServer,
                inject: [RedisProvider, RealtimeService],
                useFactory: (redis: RedisProvider, realtime: RealtimeService) =>
                  new HeadlessSocketServer(redis, realtime),
              },
            ]
          : []),
      ],
      exports: [RealtimeService],
    };
  }
}
