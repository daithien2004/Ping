import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import type { GifSearchResponse } from '@ping/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { GifsService } from './gifs.service.js';
import { gifSearchQuerySchema, gifTrendingQuerySchema } from './schemas.js';
import type { GifSearchQuery, GifTrendingQuery } from './schemas.js';

@Controller('gifs')
@UseGuards(JwtAuthGuard)
export class GifsController {
  constructor(private readonly gifsService: GifsService) {}

  @Get('search')
  search(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(gifSearchQuerySchema)) query: GifSearchQuery,
  ): Promise<GifSearchResponse> {
    return this.gifsService.search(user.userId, query.q, query.limit);
  }

  @Get('trending')
  trending(
    @CurrentUser() user: AuthenticatedUser,
    @Query(new ZodValidationPipe(gifTrendingQuerySchema)) query: GifTrendingQuery,
  ): Promise<GifSearchResponse> {
    return this.gifsService.trending(user.userId, query.limit);
  }
}
