import { Global, Injectable, Module } from '@nestjs/common';
import { ClsService } from 'nestjs-cls';
import type { AuditAction, Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

export interface AuditEntry {
  serverId: string;
  actorId: string;
  action: AuditAction;
  targetId?: string;
  metadata?: Prisma.InputJsonValue;
}

/**
 * Ghi AuditLog (quy tắc 11). `record` nhận client của transaction đang chạy để bản ghi
 * audit và hành động được ghi cùng thành công hoặc cùng hủy — không có hành động "lọt sổ".
 * requestId lấy từ CLS: trùng với requestId trong log và header X-Request-Id.
 */
@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  record(entry: AuditEntry, db: Prisma.TransactionClient = this.prisma) {
    return db.auditLog.create({ data: { ...entry, requestId: this.cls.getId() } });
  }
}

@Global()
@Module({ providers: [AuditService], exports: [AuditService] })
export class AuditModule {}
