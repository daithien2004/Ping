import {
  Global,
  Injectable,
  Module,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// Named import: dưới nodenext, default import của gói CJS này bị typed là module namespace.
import { Redis } from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import type { Env } from '../../config/env.schema.js';

@Injectable()
export class RedisProvider extends Redis implements OnModuleInit, OnApplicationShutdown {
  constructor(config: ConfigService<Env, true>, logger: PinoLogger) {
    super(config.getOrThrow('REDIS_URL', { infer: true }), {
      // Retry mỗi lệnh 1 lần: mặc định 20 lần làm lệnh kẹt hàng chục giây khi Redis chết.
      commandTimeout: config.getOrThrow('REDIS_COMMAND_TIMEOUT_MS', { infer: true }),
      maxRetriesPerRequest: 1,
      connectTimeout: 2_000,
    });
    // ioredis retry mãi sau ECONNREFUSED và emit 'error' mỗi lần; không có listener thì spam console.
    this.on('error', (error: Error) => {
      logger.warn({ err: error }, 'redis unreachable, retrying');
    });
  }

  // Kiểm cờ này TRƯỚC khi gọi để request không phải chờ hết commandTimeout khi Redis chết.
  get isUp(): boolean {
    return this.status === 'ready';
  }

  // Chờ kết nối đầu tối đa 2 giây, nếu không vài request đầu bị từ chối oan ở endpoint fail-closed.
  // Không fail-fast: Redis chết lúc khởi động vẫn lên, chạy suy giảm.
  async onModuleInit(): Promise<void> {
    if (this.isUp) {
      return;
    }
    await new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this.off('ready', done);
        this.off('error', done);
        resolve();
      };
      const timer = setTimeout(done, 2_000);
      this.once('ready', done);
      this.once('error', done);
    });
  }

  // KHÔNG đóng ở onModuleDestroy: Socket.IO còn cần Redis để cập nhật presence khi ngắt socket.
  async onApplicationShutdown(): Promise<void> {
    if (this.status === 'end') {
      return;
    }
    await this.quit().catch(() => this.disconnect());
  }
}

@Global()
@Module({
  providers: [RedisProvider],
  exports: [RedisProvider],
})
export class RedisModule {}
