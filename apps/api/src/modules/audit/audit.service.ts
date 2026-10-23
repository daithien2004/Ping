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

  /**
   * Đọc nhật ký hành động của một server (TF.10).
   *
   * Chỉ lọc theo serverId ở đây — quyền xem do guard (`view AuditLog`) kiểm tra trước,
   * nên service không cần biết ai gọi. `after` là id bản ghi cuối của trang trước:
   * UUIDv7 tăng dần theo thời điểm ghi nên với thứ tự giảm dần, mốc là `id < after`.
   */
  async list(serverId: string, query: ListAuditLogQuery) {
    const rows = await this.prisma.auditLog.findMany({
      where: {
        serverId,
        ...(query.action ? { action: query.action } : {}),
        ...(query.actorId ? { actorId: query.actorId } : {}),
        ...(query.after ? { id: { lt: query.after } } : {}),
      },
      orderBy: { id: 'desc' },
      take: query.limit + 1, // lấy dư một dòng để biết còn trang sau
    });
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;

    // AuditLog không có quan hệ với User (bản ghi phải còn khi user bị xoá) nên tra tên
    // người thực hiện bằng một query riêng theo tập id.
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
