import { z } from 'zod';

/** `deleteMessages24h` = xóa mềm tin của nạn nhân trong 24 giờ gần nhất. */
export const createBanSchema = z.object({
  userId: z.uuid(),
  reason: z.string().trim().min(1).max(500).optional(),
  deleteMessages24h: z.boolean().optional(),
});
export type CreateBanInput = z.infer<typeof createBanSchema>;

export interface ServerBanDto {
  id: string;
  serverId: string;
  userId: string;
  user: { id: string; username: string; displayName: string; avatarUrl: string | null };
  reason: string | null;
  bannedBy: { id: string; username: string; displayName: string };
  createdAt: string;
}

export const listBansQuerySchema = z.object({
  after: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListBansQuery = z.infer<typeof listBansQuerySchema>;

export interface ServerBanPage {
  bans: ServerBanDto[];
  hasMore: boolean;
}
