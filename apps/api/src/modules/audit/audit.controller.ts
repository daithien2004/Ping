import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { listAuditLogQuerySchema, type ListAuditLogQuery } from '@ping/shared';
import { ZodValidationPipe } from '../../common/pipes/zod-validation.pipe.js';
import { RATE_LIMIT_BUCKETS } from '../../common/rate-limit-buckets.js';
import { AbilityGuard } from '../ability/ability.guard.js';
import { CheckAbility } from '../ability/check-ability.decorator.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { AuditService } from './audit.service.js';

@Controller('servers/:serverId/audit-log')
@Throttle({ default: RATE_LIMIT_BUCKETS.readLight })
@UseGuards(JwtAuthGuard, AbilityGuard)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  /**
   * Nhật ký hành động của server (TF.10): lọc theo hành động/người thực hiện, phân trang
   * cursor. Cần quyền `view AuditLog` (bit VIEW_AUDIT_LOG) — guard chặn trước khi vào
   * service, nên không phải member hoặc không có quyền đều không đọc được.
   */
  @Get()
  @CheckAbility(['view', 'AuditLog'])
  list(
    @Param('serverId') serverId: string,
    @Query(new ZodValidationPipe(listAuditLogQuerySchema)) query: ListAuditLogQuery,
  ) {
    return this.auditService.list(serverId, query);
  }
}
