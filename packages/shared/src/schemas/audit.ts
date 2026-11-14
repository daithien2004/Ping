import { z } from 'zod';

/** Mirror enum `AuditAction` của Prisma. */
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
  STICKER_DELETE: 'STICKER_DELETE',
  EMOJI_DELETE: 'EMOJI_DELETE',
  // Ban/unban (metadata: userId, reason?, deletedMessages?).
  SERVER_BAN: 'SERVER_BAN',
  SERVER_UNBAN: 'SERVER_UNBAN',
  // Reorder/move (metadata: categoryIds khi reorder; channelId + fromCategoryId/toCategoryId khi move).
  CHANNEL_REORDER: 'CHANNEL_REORDER',
} as const;

export const auditActionSchema = z.enum(AuditActions);
export type AuditAction = z.infer<typeof auditActionSchema>;

export const auditActionValues = Object.values(AuditActions) as AuditAction[];

export const listAuditLogQuerySchema = z.object({
  action: auditActionSchema.optional(),
  actorId: z.uuid().optional(),
  after: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListAuditLogQuery = z.infer<typeof listAuditLogQuerySchema>;

export interface AuditLogEntryDto {
  id: string;
  action: AuditAction;
  /** null khi tài khoản đã bị xoá (bản ghi audit vẫn còn). */
  actor: { id: string; username: string; displayName: string } | null;
  targetId: string | null;
  metadata: unknown;
  requestId: string | null;
  createdAt: string;
}

export interface AuditLogPage {
  entries: AuditLogEntryDto[];
  hasMore: boolean;
}
