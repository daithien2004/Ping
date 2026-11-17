import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { LoggerModule } from 'nestjs-pino';
import { LOG_REDACT_PATHS } from './common/log-redaction.js';
import { requestIdFrom } from './common/request-id.js';
import { envSchema, type Env } from './config/env.schema.js';
import { LifecycleModule } from './infra/lifecycle/lifecycle.module.js';
import { MetricsModule } from './infra/metrics/metrics.module.js';
import { PrismaModule } from './infra/prisma/prisma.module.js';
import { RedisModule } from './infra/redis/redis.module.js';
import { AbilityModule } from './modules/ability/ability.module.js';
import { HealthModule } from './modules/health/health.module.js';
import { RealtimeModule } from './modules/realtime/realtime.module.js';

/**
 * Service Realtime (ADR-0098): chỉ giữ kết nối Socket.IO. Không có controller nghiệp vụ, không chạy outbox relay,
 * indexer hay worker; chỉ có /health và /ready để orchestrator và Nginx kiểm tra.
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['../../.env'],
      validate: (config) => envSchema.parse(config),
    }),
    LoggerModule.forRoot({
      pinoHttp: {
        level: 'info',
        genReqId: (req) => requestIdFrom(req.headers['x-request-id']),
        redact: LOG_REDACT_PATHS,
        serializers: {
          req: (req) => ({ id: req.id, method: req.method, url: req.url?.split('?')[0] }),
        },
      },
    }),
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.getOrThrow('JWT_ACCESS_SECRET', { infer: true }),
      }),
    }),
    LifecycleModule,
    MetricsModule,
    PrismaModule,
    RedisModule,
    AbilityModule,
    HealthModule,
    RealtimeModule.forRoot('gateway'),
  ],
})
export class RealtimeAppModule {}
