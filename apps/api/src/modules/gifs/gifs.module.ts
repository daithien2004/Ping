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
