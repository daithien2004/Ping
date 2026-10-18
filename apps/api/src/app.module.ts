import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { ClsModule } from 'nestjs-cls';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { envSchema } from './config/env.schema.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // cwd is apps/api when started via pnpm, while .env lives at the repo root.
      envFilePath: ['../../.env'],
      validate: (config) => envSchema.parse(config),
    }),
    // LoggerModule must be imported before ClsModule so pino-http's middleware
    // runs first and sets `req.id`, which the CLS id generator reuses. That
    // keeps the log requestId, the CLS id and the X-Request-Id header equal.
    LoggerModule.forRoot({
      pinoHttp: {
        level: 'info',
        genReqId: (req) => (req.headers['x-request-id'] as string) ?? randomUUID(),
        redact: ['req.headers.authorization', 'req.headers.cookie'],
        customProps: (req) => ({ requestId: (req as { id?: string }).id }),
      },
    }),
    ClsModule.forRoot({
      global: true,
      middleware: {
        mount: true,
        generateId: true,
        idGenerator: (req) => (req.id as string | undefined) ?? randomUUID(),
        setup: (cls, _req, res) => {
          res.setHeader('X-Request-Id', cls.getId());
        },
      },
    }),
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule {}
