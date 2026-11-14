import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { HealthCheck, HealthCheckService, PrismaHealthIndicator } from '@nestjs/terminus';
import { ErrorCodes } from '@ping/shared';
import { ShutdownService } from '../../infra/lifecycle/shutdown.service.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { RedisProvider } from '../../infra/redis/redis.module.js';

// Controller ở root (không prefix) để /health và /ready là siblings.
@Controller()
export class HealthController {
  constructor(
    private readonly healthCheck: HealthCheckService,
    private readonly prisma: PrismaService,
    private readonly prismaIndicator: PrismaHealthIndicator,
    private readonly redis: RedisProvider,
    private readonly shutdown: ShutdownService,
  ) {}

  // Liveness không check DB/Redis: DB chập chờn sẽ khiến orchestrator restart vô tận.
  @Get('health')
  @SkipThrottle()
  liveness(): { status: string } {
    return { status: 'ok' };
  }

  // 503 khi đang tắt hoặc Postgres chết; chỉ Redis chết → 200 'degraded'.
  @Get('ready')
  @SkipThrottle()
  @HealthCheck()
  async readiness() {
    if (this.shutdown.draining) {
      throw new ServiceUnavailableException({
        code: ErrorCodes.SERVICE_UNAVAILABLE,
        message: 'Shutting down',
      });
    }
    const result = await this.healthCheck.check([
      () => this.prismaIndicator.pingCheck('database', this.prisma),
    ]);
    const redis = await this.redisIsUp();
    return {
      ...result,
      status: redis ? result.status : 'degraded',
      info: { ...result.info, redis: { status: redis ? 'up' : 'down' } },
      details: { ...result.details, redis: { status: redis ? 'up' : 'down' } },
    };
  }

  private async redisIsUp(): Promise<boolean> {
    if (!this.redis.isUp) {
      return false;
    }
    try {
      await this.redis.ping();
      return true;
    } catch {
      return false;
    }
  }
}
