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
import { AbilityGuard } from '../ability/ability.guard.js';
import { CheckAbility } from '../ability/check-ability.decorator.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { CategoriesService } from './categories.service.js';

/**
 * Category channel (TG.10): nhóm kênh trong sidebar. Guard: cần `manage Channel`
 * (MANAGE_CHANNELS) — cùng quyền với tạo/sửa/xóa channel vì category chỉ là cách nhóm kênh.
 * Thứ bậc/đối tượng không cần kiểm thêm: category không mang dữ liệu riêng của ai.
 */
@Controller('servers/:serverId/categories')
@UseGuards(JwtAuthGuard, AbilityGuard)
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  /** Tạo category (nối cuối danh sách): 201 kèm DTO; Idempotency-Key cho client retry. */
  @Post()
  @CheckAbility(['manage', 'Channel'])
  @UseInterceptors(IdempotencyInterceptor)
  create(
    @Param('serverId') serverId: string,
    @Body(new ZodValidationPipe(createCategorySchema)) body: CreateCategoryInput,
  ): Promise<ChannelCategoryDto> {
    return this.categoriesService.create(serverId, body.name);
  }

  /** Đổi tên category; 200 kèm DTO mới (position không đổi). */
  @Patch(':categoryId')
  @CheckAbility(['manage', 'Channel'])
  rename(
    @Param('serverId') serverId: string,
    @Param('categoryId') categoryId: string,
    @Body(new ZodValidationPipe(renameCategorySchema)) body: RenameCategoryInput,
  ): Promise<ChannelCategoryDto> {
    return this.categoriesService.rename(serverId, categoryId, body.name);
  }

  /** Xóa category — kênh về vùng mặc định (không mất kênh nào): 200 `{ id }` như xóa channel. */
  @Delete(':categoryId')
  @CheckAbility(['manage', 'Channel'])
  remove(
    @Param('serverId') serverId: string,
    @Param('categoryId') categoryId: string,
  ): Promise<{ id: string }> {
    return this.categoriesService.remove(serverId, categoryId);
  }

  /** Sắp lại thứ tự toàn bộ category theo mảng id; 200 kèm danh sách mới (position mới). */
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
