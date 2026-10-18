import { Injectable } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import { RedisProvider } from '../../infra/redis/redis.module.js';

@Injectable()
export class RedisHealthIndicator {
  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    private readonly redis: RedisProvider,
  ) {}

  // terminus 12: `.attempt()` tự đánh dấu up nếu fn resolve, down nếu fn throw.
  // ping() trả 'PONG' nhưng attempt chỉ cần biết throw hay không → discard giá trị.
  pingCheck(key: string) {
    return this.healthIndicatorService
      .check(key)
      .attempt(async () => {
        await this.redis.ping();
      })
      .withTimeout(1000);
  }
}
