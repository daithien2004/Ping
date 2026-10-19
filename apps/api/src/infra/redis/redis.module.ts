import { Global, Injectable, Module, type OnModuleDestroy } from '@nestjs/common';
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
export class RedisProvider extends Redis implements OnModuleDestroy {
  constructor(config: ConfigService<Env, true>, logger: PinoLogger) {
    super(config.getOrThrow('REDIS_URL', { infer: true }));
    // ioredis retries forever after ECONNREFUSED and emits 'error' on every
    // failed attempt. Without a listener it falls back to console spam
    // ("[ioredis] Unhandled error event"), so route it into structured logs.
    this.on('error', (error: Error) => {
      logger.warn({ err: error }, 'redis unreachable, retrying');
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
