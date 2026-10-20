import {
  Global,
  Injectable,
  Module,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
// Named import: under nodenext the default import of this CJS package gets
// typed as the module namespace (not a constructor), while `Redis` is a
// proper named export in both the .d.ts and Node's CJS named-export detection.
import { Redis } from 'ioredis';
import { PinoLogger } from 'nestjs-pino';
import type { Env } from '../../config/env.schema.js';

/**
 * Class-based provider: inject như service bình thường và Nest tự gọi
 * `quit()` khi shutdown (nhờ `enableShutdownHooks()` ở main.ts) —
 * so với `useFactory` thuần thì không thể có lifecycle hook, dọn tay là dễ quên.
 */
@Injectable()
export class RedisProvider extends Redis implements OnModuleInit, OnModuleDestroy {
  constructor(config: ConfigService<Env, true>, logger: PinoLogger) {
    super(config.getOrThrow('REDIS_URL', { infer: true }), {
      // Lệnh quá hạn thì lỗi ngay (không treo request). Retry mỗi lệnh 1 lần: mặc định 20 lần
      // làm một lệnh "kẹt" trong hàng đợi offline hàng chục giây khi Redis chết.
      commandTimeout: config.getOrThrow('REDIS_COMMAND_TIMEOUT_MS', { infer: true }),
      maxRetriesPerRequest: 1,
      connectTimeout: 2_000,
    });
    // ioredis retries forever after ECONNREFUSED and emits 'error' on every
    // failed attempt. Without a listener it falls back to console spam
    // ("[ioredis] Unhandled error event"), so route it into structured logs.
    this.on('error', (error: Error) => {
      logger.warn({ err: error }, 'redis unreachable, retrying');
    });
  }

  /**
   * Kết nối sẵn sàng nhận lệnh. Chính sách fail-open/closed kiểm tra cờ này TRƯỚC khi gọi, để lúc
   * Redis chết request không phải chờ hết commandTimeout cho từng lệnh (ADR-0026).
   */
  get isUp(): boolean {
    return this.status === 'ready';
  }

  /**
   * Chờ kết nối đầu tiên (tối đa 2 giây) trước khi app nhận request: nếu không, vài request đầu
   * sau khi khởi động thấy Redis "chưa sẵn sàng" và bị từ chối oan ở các endpoint fail-closed.
   * Không fail-fast (ADR-0011): Redis chết lúc khởi động thì app vẫn lên, chạy suy giảm.
   */
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
      this.once('error', done); // từ chối ngay (ECONNREFUSED): không cần chờ hết 2 giây
    });
  }

  onModuleDestroy(): Promise<'OK'> {
    return this.quit();
  }
}

@Global()
@Module({
  providers: [RedisProvider],
  exports: [RedisProvider],
})
export class RedisModule {}
