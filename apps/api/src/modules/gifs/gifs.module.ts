import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';
import { AuthModule } from '../auth/auth.module.js';
import { GifCache } from './gif-cache.js';
import type { GifProvider } from './gif-provider.port.js';
import { GifRateLimiter } from './gif-rate-limiter.js';
import { GIF_PROVIDER } from './gif.tokens.js';
import { GifsController } from './gifs.controller.js';
import { GifsService } from './gifs.service.js';
import { TenorProvider } from './tenor.provider.js';

export { GIF_PROVIDER } from './gif.tokens.js';

/**
 * Cổng GIF (TG.25, ADR-0069). Chỉ phụ thuộc AuthModule: tìm GIF không gắn server nên không
 * có ability mới. Cache in-memory 5 phút là một instance của tiến trình (kết quả công khai,
 * ADR-0069 mục 3); key Tenor đọc từ env một lần lúc dựng adapter.
 */
@Module({
  imports: [AuthModule],
  controllers: [GifsController],
  providers: [
    {
      provide: GIF_PROVIDER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>): GifProvider =>
        new TenorProvider(config.get('TENOR_API_KEY', { infer: true }), fetch),
    },
    { provide: GifCache, useFactory: () => new GifCache() },
    GifRateLimiter,
    GifsService,
  ],
  exports: [GIF_PROVIDER],
})
export class GifsModule {}
