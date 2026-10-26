import { z } from 'zod';

/**
 * Hành động ghi trong nhật ký audit — mirror enum `AuditAction` của Prisma.
 * Dùng object (không phải mảng) để `z.enum` nhận được và để UI lấy danh sách giá trị.
 */
export const AuditActions = {
  ROLE_CREATE: 'ROLE_CREATE',
  ROLE_UPDATE: 'ROLE_UPDATE',
  ROLE_DELETE: 'ROLE_DELETE',
  MEMBER_ROLES_UPDATE: 'MEMBER_ROLES_UPDATE',
  MEMBER_KICK: 'MEMBER_KICK',
  MESSAGE_DELETE: 'MESSAGE_DELETE',
  CHANNEL_DELETE: 'CHANNEL_DELETE',
  CHANNEL_UPDATE: 'CHANNEL_UPDATE',
  SERVER_DELETE: 'SERVER_DELETE',
  SERVER_UPDATE: 'SERVER_UPDATE',
  SERVER_INVITE_REGENERATE: 'SERVER_INVITE_REGENERATE',
  MESSAGE_PIN: 'MESSAGE_PIN',
  MESSAGE_UNPIN: 'MESSAGE_UNPIN',
} as const;

export const auditActionSchema = z.enum(AuditActions);
export type AuditAction = z.infer<typeof auditActionSchema>;

/** Danh sách giá trị hành động (dùng cho bộ lọc trong UI). */
export const auditActionValues = Object.values(AuditActions) as AuditAction[];

/**
 * GET /servers/:id/audit-log — lọc theo hành động hoặc người thực hiện, phân trang cursor.
 * `after` = id bản ghi cuối của trang trước (UUIDv7 tăng dần theo thời điểm ghi).
 */
export const listAuditLogQuerySchema = z.object({
  action: auditActionSchema.optional(),
  actorId: z.uuid().optional(),
  after: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListAuditLogQuery = z.infer<typeof listAuditLogQuerySchema>;

/** Một dòng nhật ký. Ngày giờ là chuỗi ISO 8601 qua JSON. */
export interface AuditLogEntryDto {
  id: string;
  action: AuditAction;
  /** Người thực hiện; null khi tài khoản đã bị xoá (bản ghi audit vẫn còn). */
  actor: { id: string; username: string; displayName: string } | null;
  targetId: string | null;
  /** Chi tiết tuỳ hành động (JSON tự do do API ghi). */
  metadata: unknown;
  /** requestId để đối chiếu với log của API. */
  requestId: string | null;
  createdAt: string;
}

/** Một trang nhật ký (cursor `after` = id bản ghi cuối trang trước). */
export interface AuditLogPage {
  entries: AuditLogEntryDto[];
  hasMore: boolean;
}
