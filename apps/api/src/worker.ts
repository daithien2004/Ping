import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module.js';
import { ConfigService } from '@nestjs/config';
import type { Env } from './config/env.schema.js';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.flushLogs();
  app.enableShutdownHooks();

  const config = app.get(ConfigService<Env, true>);
  const logger = app.get(Logger);
  logger.log({ port: config.get('PORT', { infer: true }) }, 'worker started (outbox relay)');
  // Giữ process sống; relay service đã chạy qua onModuleInit.
  await new Promise<void>(() => {});
}

bootstrap().catch((error) => {
   
  console.error(error);
  process.exit(1);
});
