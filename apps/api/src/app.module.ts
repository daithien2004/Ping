import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { randomUUID } from 'node:crypto';
import { ClsModule } from 'nestjs-cls';
import { MetricsModule } from './infra/metrics/metrics.module.js';
import { LoggerModule } from 'nestjs-pino';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AttachmentsModule } from './modules/attachments/attachments.module.js';
// Side-effect: dạy JSON.stringify serialize BigInt (Role.permissions) thành string.
import './common/bigint-json.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { HttpThrottlerGuard } from './common/guards/http-throttler.guard.js';
import { UuidParamsGuard } from './common/guards/uuid-params.guard.js';
import { LOG_REDACT_PATHS } from './common/log-redaction.js';
import { requestIdFrom } from './common/request-id.js';
import { envSchema } from './config/env.schema.js';
import { LifecycleModule } from './infra/lifecycle/lifecycle.module.js';
import { PrismaModule } from './infra/prisma/prisma.module.js';
import { RedisModule, RedisProvider } from './infra/redis/redis.module.js';
import { RedisThrottlerStorage } from './infra/throttler/redis-throttler.storage.js';
import { AbilityModule } from './modules/ability/ability.module.js';
import { AiModule } from './modules/ai/ai.module.js';
import { AuditModule } from './modules/audit/audit.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { EventsModule } from './infra/events/events.module.js';
import { ChannelsModule } from './modules/channels/channels.module.js';
import { DmsModule } from './modules/dms/dms.module.js';
import { GifsModule } from './modules/gifs/gifs.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { EmojisModule } from './modules/emojis/emojis.module.js';
import { MessagesModule } from './modules/messages/messages.module.js';
import { RealtimeModule } from './modules/realtime/realtime.module.js';
import { RolesModule } from './modules/roles/roles.module.js';
import { ServersModule } from './modules/servers/servers.module.js';
import { StickersModule } from './modules/stickers/stickers.module.js';
import { UsersModule } from './modules/users/users.module.js';

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
        redact: LOG_REDACT_PATHS,
        customProps: (req) => ({ requestId: (req as { id?: string }).id }),
        serializers: {
          req: (req) => ({ id: req.id, method: req.method, url: req.url?.split('?')[0] }),
        },
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
    MetricsModule,
    PrismaModule,
    RedisModule,
    EventsModule,
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
    DmsModule,
    RolesModule,
    MessagesModule,
    StickersModule,
    EmojisModule,
    GifsModule,
    AttachmentsModule,
    RealtimeModule,
    AiModule,
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
