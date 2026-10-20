import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { randomUUID } from 'node:crypto';
import { ClsModule } from 'nestjs-cls';
import { LoggerModule } from 'nestjs-pino';
import { z } from 'zod';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
// Side-effect: dạy JSON.stringify serialize BigInt (Role.permissions) thành string.
import './common/bigint-json.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { HttpThrottlerGuard } from './common/guards/http-throttler.guard.js';
import { UuidParamsGuard } from './common/guards/uuid-params.guard.js';
import { envSchema } from './config/env.schema.js';
import { LifecycleModule } from './infra/lifecycle/lifecycle.module.js';
import { PrismaModule } from './infra/prisma/prisma.module.js';
import { RedisModule, RedisProvider } from './infra/redis/redis.module.js';
import { RedisThrottlerStorage } from './infra/throttler/redis-throttler.storage.js';
import { AbilityModule } from './modules/ability/ability.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { ChannelsModule } from './modules/channels/channels.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { MessagesModule } from './modules/messages/messages.module.js';
import { RealtimeModule } from './modules/realtime/realtime.module.js';
import { RolesModule } from './modules/roles/roles.module.js';
import { ServersModule } from './modules/servers/servers.module.js';
import { UsersModule } from './modules/users/users.module.js';

const uuid = z.uuid();

/** Chỉ dùng lại X-Request-Id của client khi là UUID: chuỗi tùy ý sẽ đi thẳng vào log và header. */
function requestIdFrom(header: string | string[] | undefined): string {
  return typeof header === 'string' && uuid.safeParse(header).success ? header : randomUUID();
}

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
        genReqId: (req) => requestIdFrom(req.headers['x-request-id']),
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
    LifecycleModule,
    PrismaModule,
    RedisModule,
    ThrottlerModule.forRootAsync({
      inject: [RedisProvider],
      useFactory: (redis: RedisProvider) => ({
        throttlers: [{ ttl: 60_000, limit: 100, blockDuration: 60_000 }],
        storage: new RedisThrottlerStorage(redis),
      }),
    }),
    AuthModule,
    HealthModule,
    UsersModule,
    // AbilityModule toàn cục: AbilityGuard ở mọi module server-scoped resolve
    // AbilityFactory từ đây, không phải provider riêng của từng module.
    AbilityModule,
    // Toàn cục: service nào làm hành động nhạy cảm cũng ghi AuditLog được.
    AuditModule,
    ServersModule,
    ChannelsModule,
    RolesModule,
    MessagesModule,
    RealtimeModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Rate limit áp cho MỌI route — health controller tự @SkipThrottler().
    { provide: APP_GUARD, useClass: HttpThrottlerGuard },
    // Chạy trước mọi guard của controller (AbilityGuard query DB bằng các id này).
    { provide: APP_GUARD, useClass: UuidParamsGuard },
  ],
})
export class AppModule {}
