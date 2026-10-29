import { z } from 'zod';

/**
 * POST /servers/:serverId/bans (TG.11): cấm một thành viên tham gia server.
 * `reason` chỉ ghi vào ServerBan/audit để người quản lý xem — không phát realtime
 * cho cả server (lý do ban không phải thông tin của mọi thành viên).
 * `deleteMessages24h` = xóa mềm toàn bộ tin của nạn nhân trong 24 giờ gần nhất
 * trên các channel của server (pattern soft-delete của Message.deletedAt).
 */
export const createBanSchema = z.object({
  userId: z.uuid(),
  reason: z.string().trim().min(1).max(500).optional(),
  deleteMessages24h: z.boolean().optional(),
});
export type CreateBanInput = z.infer<typeof createBanSchema>;

/** Một dòng trong danh sách ban (POST tạo mới cũng trả shape này). Ngày giờ là chuỗi ISO 8601. */
export interface ServerBanDto {
  id: string;
  serverId: string;
  userId: string;
  user: { id: string; username: string; displayName: string; avatarUrl: string | null };
  reason: string | null;
  /** Người ra lệnh ban; xóa mềm tin 24h thì đây là số tin đã bị xóa (chỉ có ở response POST). */
  bannedBy: { id: string; username: string; displayName: string };
  createdAt: string;
}

/**
 * GET /servers/:serverId/bans — phân trang cursor (ADR-0028): `after` = id dòng cuối
 * trang trước, mới nhất trước (UUIDv7 tăng dần nên mốc là `id < after`).
 */
export const listBansQuerySchema = z.object({
  after: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListBansQuery = z.infer<typeof listBansQuerySchema>;

export interface ServerBanPage {
  bans: ServerBanDto[];
  hasMore: boolean;
}
