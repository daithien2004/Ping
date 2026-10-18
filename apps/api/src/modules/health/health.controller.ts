import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { HealthCheck, HealthCheckService, PrismaHealthIndicator } from '@nestjs/terminus';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { RedisHealthIndicator } from './redis.health.js';

// Controller ở root (không prefix) để 2 endpoint là siblings:
//   GET /api/v1/health  và  GET /api/v1/ready
// (nếu gắn @Controller('health') thì route con sẽ thành /health/ready).
@Controller()
export class HealthController {
  constructor(
    private readonly healthCheck: HealthCheckService,
    private readonly prisma: PrismaService,
    private readonly prismaIndicator: PrismaHealthIndicator,
    private readonly redisIndicator: RedisHealthIndicator,
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

  /** Readiness: nhận traffic được chưa — DB và Redis cùng phải up. */
  @Get('ready')
  @SkipThrottle()
  @HealthCheck()
  readiness() {
    return this.healthCheck.check([
      () => this.prismaIndicator.pingCheck('database', this.prisma),
      () => this.redisIndicator.pingCheck('redis'),
    ]);
  }
}
