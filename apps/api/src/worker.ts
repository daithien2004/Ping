import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { ConfigService } from '@nestjs/config';
import type { Env } from './config/env.schema.js';
import { MetricsService } from './infra/metrics/metrics.service.js';

async function bootstrap() {
  process.env.PING_PROCESS_ROLE = 'worker';
  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.flushLogs();
  app.enableShutdownHooks();

  const config = app.get(ConfigService<Env, true>);
  const logger = app.get(Logger);
  // Metrics/health của worker nằm trên cổng riêng (ADR-0031); compose dùng nó làm healthcheck.
  const metricsPort = config.get('METRICS_PORT', { infer: true });
  if (metricsPort) await app.get(MetricsService).listen(metricsPort);
  logger.log(
    { port: config.get('PORT', { infer: true }), metricsPort: metricsPort ?? null },
    'worker started (outbox relay)',
  );
  // Giữ process sống; relay service đã chạy qua onModuleInit.
  await new Promise<void>(() => {});
}

bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
