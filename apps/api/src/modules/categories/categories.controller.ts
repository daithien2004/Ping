import {
  Body,
  Controller,
  Delete,
  Param,
  Patch,
  Post,
  Put,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  createCategorySchema,
  renameCategorySchema,
  reorderCategoriesSchema,
  type ChannelCategoryDto,
  type CreateCategoryInput,
  type RenameCategoryInput,
  type ReorderCategoriesInput,
} from '@ping/shared';
import { IdempotencyInterceptor } from '../../common/interceptors/idempotency.interceptor.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { RATE_LIMIT_BUCKETS } from '../../common/rate-limit-buckets.js';
import { AbilityGuard } from '../ability/ability.guard.js';
import { CheckAbility } from '../ability/check-ability.decorator.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CategoriesService } from './categories.service.js';

@Controller('servers/:serverId/categories')
@Throttle({ default: RATE_LIMIT_BUCKETS.writeStructure })
@UseGuards(JwtAuthGuard, AbilityGuard)
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @CheckAbility(['manage', 'Channel'])
  @UseInterceptors(IdempotencyInterceptor)
  create(
    @Param('serverId') serverId: string,
    @Body(new ZodValidationPipe(createCategorySchema)) body: CreateCategoryInput,
  ): Promise<ChannelCategoryDto> {
    return this.categoriesService.create(serverId, body.name);
  }

  @Patch(':categoryId')
  @CheckAbility(['manage', 'Channel'])
  rename(
    @Param('serverId') serverId: string,
    @Param('categoryId') categoryId: string,
    @Body(new ZodValidationPipe(renameCategorySchema)) body: RenameCategoryInput,
  ): Promise<ChannelCategoryDto> {
    return this.categoriesService.rename(serverId, categoryId, body.name);
  }

  @Delete(':categoryId')
  @CheckAbility(['manage', 'Channel'])
  remove(
    @Param('serverId') serverId: string,
    @Param('categoryId') categoryId: string,
  ): Promise<{ id: string }> {
    return this.categoriesService.remove(serverId, categoryId);
  }

  @Put('reorder')
  @CheckAbility(['manage', 'Channel'])
  reorder(
    @CurrentUser() user: AuthenticatedUser,
    @Param('serverId') serverId: string,
    @Body(new ZodValidationPipe(reorderCategoriesSchema)) body: ReorderCategoriesInput,
  ): Promise<ChannelCategoryDto[]> {
    return this.categoriesService.reorder(serverId, user.userId, body);
  }
}
