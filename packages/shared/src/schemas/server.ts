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

/** Một thành viên trong GET /servers/:id/members. Ngày giờ là chuỗi ISO 8601 qua JSON. */
export interface MemberDto {
  id: string;
  serverId: string;
  userId: string;
  nickname: string | null;
  joinedAt: string;
  user: { id: string; username: string; displayName: string; avatarUrl: string | null };
  /** Role của thành viên, bọc theo bảng nối (MemberRole): `roles[i].role`. @everyone không nằm đây. */
  roles: Array<{ role: { id: string; name: string } }>;
  /** Đang có ít nhất một socket mở (ADR-0030). Sau đó `presence.updated` cập nhật tiếp. */
  online: boolean;
}

/** GET /servers/:id/members — phân trang cursor (ADR-0028): `after` = id thành viên cuối trang trước. */
export interface MemberPage {
  members: MemberDto[];
  hasMore: boolean;
}

export const listMembersQuerySchema = z.object({
  after: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListMembersQuery = z.infer<typeof listMembersQuerySchema>;

/** Một dòng trong GET /servers (các server của tôi). Ngày giờ là chuỗi ISO 8601 qua JSON. */
export interface ServerSummary {
  id: string;
  name: string;
  iconUrl: string | null;
  ownerId: string;
  inviteCode: string;
  createdAt: string;
  memberCount: number;
  channelCount: number;
}

export interface RoleDto {
  id: string;
  serverId: string;
  name: string;
  /** Bitmask bigint dạng chuỗi thập phân. */
  permissions: string;
  position: number;
  isDefault: boolean;
  /** Chỉ có ở GET /servers/:id/roles. */
  memberCount?: number;
}

/** GET /servers/:id và POST /servers. */
export interface ServerDetail extends Omit<ServerSummary, 'memberCount' | 'channelCount'> {
  channels: ChannelDto[];
  roles: RoleDto[];
  /** Có ở GET /servers/:id, không có ở POST /servers (server mới chỉ có chủ). */
  memberCount?: number;
}

/** POST /servers/join. */
export interface JoinServerResponse {
  server: { id: string; name: string; inviteCode: string };
}
