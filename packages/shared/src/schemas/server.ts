import { z } from 'zod';

export const createServerSchema = z.object({
  name: z.string().trim().min(1).max(100),
});
export type CreateServerInput = z.infer<typeof createServerSchema>;

/**
 * GET /servers/:serverId/me/permissions — đầu vào cho defineAbilityFor ở frontend.
 * `permissions` là bitmask bigint dạng chuỗi thập phân (JSON không có bigint).
 */
export interface MyServerPermissions {
  isOwner: boolean;
  permissions: string;
}
