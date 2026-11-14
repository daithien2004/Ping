import { Injectable } from '@nestjs/common';
import type { ListAuditLogQuery } from '@ping/shared';
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

// Nhận client của transaction đang chạy để audit và hành động cùng commit/rollback.
@Injectable()
export class AuditService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cls: ClsService,
  ) {}

  record(entry: AuditEntry, db: Prisma.TransactionClient = this.prisma) {
    return db.auditLog.create({ data: { ...entry, requestId: this.cls.getId() } });
  }

  async list(serverId: string, query: ListAuditLogQuery) {
    const rows = await this.prisma.auditLog.findMany({
      where: {
        serverId,
        ...(query.action ? { action: query.action } : {}),
        ...(query.actorId ? { actorId: query.actorId } : {}),
        ...(query.after ? { id: { lt: query.after } } : {}),
      },
      orderBy: { id: 'desc' },
      take: query.limit + 1,
    });
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;

    // AuditLog không có quan hệ với User (bản ghi phải còn khi user bị xóa) nên tra tên bằng query riêng.
    const actors = await this.prisma.user.findMany({
      where: { id: { in: [...new Set(page.map((row) => row.actorId))] } },
      select: { id: true, username: true, displayName: true },
    });
    const actorById = new Map(actors.map((actor) => [actor.id, actor]));

    return {
      entries: page.map((row) => ({
        id: row.id,
        action: row.action,
        actor: actorById.get(row.actorId) ?? null,
        targetId: row.targetId,
        metadata: row.metadata,
        requestId: row.requestId,
        createdAt: row.createdAt.toISOString(),
      })),
      hasMore,
    };
  }
}
