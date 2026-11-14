import {
  type BeforeApplicationShutdown,
  Injectable,
  Logger,
  type OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';

// Redis/Postgres đóng SAU Socket.IO/HTTP (onApplicationShutdown) để request và socket đang dở còn hạ tầng chạy nốt.
// app.close() gọi tay không có signal → không drain, không chờ.
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
