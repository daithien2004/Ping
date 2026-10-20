import { z } from 'zod';
import type { ChannelDto } from './channel';

export const createServerSchema = z.object({
  name: z.string().trim().min(1).max(100),
});
export type CreateServerInput = z.infer<typeof createServerSchema>;

export const joinServerSchema = z.object({
  inviteCode: z.string().trim().min(1).max(64),
});
export type JoinServerInput = z.infer<typeof joinServerSchema>;

/**
 * GET /servers/:serverId/me/permissions — đầu vào cho defineAbilityFor ở frontend.
 * `permissions` là bitmask bigint dạng chuỗi thập phân (JSON không có bigint).
 */
export const myServerPermissionsSchema = z.object({
  isOwner: z.boolean(),
  permissions: z.string().regex(/^\d+$/),
});
export type MyServerPermissions = z.infer<typeof myServerPermissionsSchema>;

/** Một dòng trong GET /servers (các server của tôi). Ngày giờ là chuỗi ISO 8601 qua JSON. */
export interface ServerSummary {
  id: string;
  name: string;
  iconUrl: string | null;
  ownerId: string;
  inviteCode: string;
  createdAt: string;
  _count: { members: number; channels: number };
}

export interface RoleDto {
  id: string;
  serverId: string;
  name: string;
  /** Bitmask bigint dạng chuỗi thập phân. */
  permissions: string;
  position: number;
  isDefault: boolean;
}

/** GET /servers/:id và POST /servers. */
export interface ServerDetail extends Omit<ServerSummary, '_count'> {
  channels: ChannelDto[];
  roles: RoleDto[];
  _count?: { members: number };
}

/** POST /servers/join. */
export interface JoinServerResponse {
  server: { id: string; name: string; inviteCode: string };
}
