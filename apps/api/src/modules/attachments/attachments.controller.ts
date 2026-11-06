import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import {
  createUploadSchema,
  downloadQuerySchema,
  signedFileQuerySchema,
  type CreateUploadInput,
  type SignedFileQuery,
} from '@ping/shared';
import type { Request, Response } from 'express';
import { RateLimitByIp } from '../../common/decorators.js';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { RATE_LIMIT_BUCKETS } from '../../common/rate-limit-buckets.js';
import { AbilityGuard } from '../ability/ability.guard.js';
import { CheckAbility } from '../ability/check-ability.decorator.js';
import { CurrentUser, type AuthenticatedUser } from '../auth/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { AttachmentsService } from './attachments.service.js';

// Mặc định cả controller là bucket uploads (30/phút); hai route đọc byte tệp có bucket riêng
// bên dưới vì chúng bị gọi hàng loạt khi một kênh nhiều ảnh.
@Controller()
@Throttle({ default: RATE_LIMIT_BUCKETS.uploads })
export class AttachmentsController {
  constructor(private readonly service: AttachmentsService) {}
  @Post('uploads')
  @UseGuards(JwtAuthGuard)
  create(
    @CurrentUser() user: AuthenticatedUser,
    @Body(new ZodValidationPipe(createUploadSchema)) body: CreateUploadInput,
  ) {
    return this.service.create(user.userId, body);
  }
  @Put('uploads/:uploadId/content')
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility(['create', 'Attachment'])
  upload(
    @CurrentUser() user: AuthenticatedUser,
    @Param('uploadId') id: string,
    @Req() req: Request,
  ) {
    return this.service.upload(id, user.userId, req);
  }
  @Post('uploads/:uploadId/complete')
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility(['create', 'Attachment'])
  complete(@CurrentUser() user: AuthenticatedUser, @Param('uploadId') id: string) {
    return this.service.complete(id, user.userId);
  }
  @Get('uploads/:uploadId')
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility(['create', 'Attachment'])
  status(@CurrentUser() user: AuthenticatedUser, @Param('uploadId') id: string) {
    return this.service.status(id, user.userId);
  }
  @Delete('uploads/:uploadId')
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility(['create', 'Attachment'])
  cancel(@CurrentUser() user: AuthenticatedUser, @Param('uploadId') id: string) {
    return this.service.cancel(id, user.userId);
  }
  // Có Authorization nên khoá theo người dùng (ADR-0080); chỉ `/file` bên dưới cần khoá theo IP.
  @Get('attachments/:attachmentId/download')
  @Throttle({ default: RATE_LIMIT_BUCKETS.attachmentRead })
  @UseGuards(JwtAuthGuard, AbilityGuard)
  @CheckAbility(['view', 'Attachment'])
  link(
    @CurrentUser() user: AuthenticatedUser,
    @Param('attachmentId') id: string,
    @Query(new ZodValidationPipe(downloadQuerySchema)) query: { thumbnail?: '1' },
  ) {
    return this.service.link(id, user.userId, query.thumbnail === '1');
  }
  // Authentication: short-lived HMAC capability, followed by fresh CASL/membership.
  @Get('attachments/:attachmentId/file')
  @Throttle({ default: RATE_LIMIT_BUCKETS.attachmentRead })
  @RateLimitByIp()
  file(
    @Param('attachmentId') id: string,
    @Query(new ZodValidationPipe(signedFileQuerySchema)) query: SignedFileQuery,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.service.file(id, query, res);
  }
}
