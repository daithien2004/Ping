import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { HealthCheck, HealthCheckService, PrismaHealthIndicator } from '@nestjs/terminus';
import { ErrorCodes } from '@ping/shared';
import { ShutdownService } from '../../infra/lifecycle/shutdown.service.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { RedisProvider } from '../../infra/redis/redis.module.js';

// Controller ở root (không prefix) để 2 endpoint là siblings:
//   GET /api/v1/health  và  GET /api/v1/ready
// (nếu gắn @Controller('health') thì route con sẽ thành /health/ready).
@Controller()
export class HealthController {
  constructor(
    private readonly healthCheck: HealthCheckService,
    private readonly prisma: PrismaService,
    private readonly prismaIndicator: PrismaHealthIndicator,
    private readonly redis: RedisProvider,
    private readonly shutdown: ShutdownService,
  ) {}

  /**
   * Liveness: process còn sống không — KHÔNG check DB/Redis.
   * Nếu liveness đụng DB mà DB chập chờn, orchestrator sẽ restart
   * vòng vô tận mà không sửa được gì (lỗi nằm ở DB, không ở process).
   */
  @Get('health')
  @SkipThrottle()
  liveness(): { status: string } {
    return { status: 'ok' };
  }

  /**
   * Readiness: instance có nên nhận traffic không (ADR-0026).
   * - đang tắt (SIGTERM) hoặc Postgres chết → 503: load balancer loại instance khỏi pool.
   * - chỉ Redis chết → 200 `degraded`: REST và lưu tin nhắn vẫn chạy (Postgres là nguồn sự thật),
   *   chỉ realtime giữa các instance suy giảm. Giám sát đọc `status`/`details.redis`.
   */
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
    // Throw 503 (body của terminus kèm chi tiết) nếu Postgres chết.
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
      await this.redis.ping(); // commandTimeout cắt nếu Redis treo
      return true;
    } catch {
      return false;
    }
  }
}
