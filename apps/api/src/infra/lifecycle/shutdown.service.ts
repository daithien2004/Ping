import {
  type BeforeApplicationShutdown,
  Injectable,
  Logger,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';

/**
 * Tắt êm khi nhận SIGTERM/SIGINT (ADR-0026). Thứ tự của Nest 12 khi tắt:
 * onModuleDestroy → beforeApplicationShutdown (đây) → đóng Socket.IO + HTTP → onApplicationShutdown.
 *
 * 1. `draining = true`: `/ready` trả 503 để load balancer ngừng gửi request mới.
 * 2. Chờ SHUTDOWN_GRACE_MS để LB kịp loại instance (server vẫn nhận và xử lý request trong lúc đó).
 * 3. Nest đóng Socket.IO rồi HTTP (HTTP chờ request đang chạy xong), SAU ĐÓ Redis/Postgres mới đóng
 *    (onApplicationShutdown), nên request và socket đang dở vẫn còn hạ tầng để chạy nốt (sửa O1).
 * 4. Watchdog: cả quá trình vượt SHUTDOWN_TIMEOUT_MS thì exit(1) thay vì treo.
 *
 * `app.close()` gọi tay (test, script) không có signal → không drain, không chờ.
 */
@Injectable()
export class ShutdownService implements BeforeApplicationShutdown, OnApplicationShutdown {
  private readonly logger = new Logger(ShutdownService.name);
  private isDraining = false;
  private watchdog: NodeJS.Timeout | undefined;

  constructor(private readonly config: ConfigService<Env, true>) {}

  get draining(): boolean {
    return this.isDraining;
  }

  beginDrain(): void {
    this.isDraining = true;
  }

  async beforeApplicationShutdown(signal?: string): Promise<void> {
    if (!signal) {
      return;
    }
    this.beginDrain();
    const graceMs = this.config.getOrThrow('SHUTDOWN_GRACE_MS', { infer: true });
    const timeoutMs = this.config.getOrThrow('SHUTDOWN_TIMEOUT_MS', { infer: true });
    this.logger.log({ signal, graceMs, timeoutMs }, 'shutdown started: draining');
    this.watchdog = setTimeout(() => {
      this.logger.error({ timeoutMs }, 'shutdown timed out, forcing exit');
      process.exit(1);
    }, timeoutMs);
    this.watchdog.unref();
    if (graceMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, graceMs));
    }
  }

  onApplicationShutdown(): void {
    clearTimeout(this.watchdog);
  }
}
