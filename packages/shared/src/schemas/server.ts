import { z } from 'zod';
import type { ChannelCategoryDto, ChannelDto } from './channel';

export const createServerSchema = z.object({
  name: z.string().trim().min(1).max(100),
});
export type CreateServerInput = z.infer<typeof createServerSchema>;

export const joinServerSchema = z.object({
  inviteCode: z.string().trim().min(1).max(64),
});
export type JoinServerInput = z.infer<typeof joinServerSchema>;

/** `iconAttachmentId` phải là attachment `scope=serverIcon` đã `ready`. */
export const updateServerSchema = z
  .object({
    name: z.string().trim().min(1).max(100).optional(),
    iconAttachmentId: z.uuid().optional(),
  })
  .refine((value) => value.name !== undefined || value.iconAttachmentId !== undefined, {
    message: 'nothing to update',
  });
export type UpdateServerInput = z.infer<typeof updateServerSchema>;

export interface UpdateServerResult {
  id: string;
  name: string;
  iconUrl: string | null;
}

/** `permissions` là bitmask bigint dạng chuỗi thập phân (JSON không có bigint). */
export const myServerPermissionsSchema = z.object({
  isOwner: z.boolean(),
  permissions: z.string().regex(/^\d+$/),
});
export type MyServerPermissions = z.infer<typeof myServerPermissionsSchema>;

export interface MemberDto {
  id: string;
  serverId: string;
  userId: string;
  nickname: string | null;
  joinedAt: string;
  user: { id: string; username: string; displayName: string; avatarUrl: string | null };
  /** @everyone không nằm trong đây. */
  roles: Array<{ role: { id: string; name: string } }>;
  online: boolean;
}

export interface MemberPage {
  members: MemberDto[];
  hasMore: boolean;
}

export const listMembersQuerySchema = z.object({
  after: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ListMembersQuery = z.infer<typeof listMembersQuerySchema>;

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
  permissions: string;
  position: number;
  isDefault: boolean;
  memberCount?: number;
}

export interface ServerDetail extends Omit<ServerSummary, 'memberCount' | 'channelCount'> {
  channels: ChannelDto[];
  categories?: ChannelCategoryDto[];
  roles: RoleDto[];
  memberCount?: number;
  inviteExpiresAt?: string | null;
}

export interface JoinServerResponse {
  server: { id: string; name: string; inviteCode: string };
}

/** `expiresInDays` bỏ qua = mã không hạn dùng. */
export const regenerateInviteSchema = z.object({
  expiresInDays: z.coerce.number().int().min(1).max(30).optional(),
});
export type RegenerateInviteInput = z.infer<typeof regenerateInviteSchema>;

export interface InviteDto {
  code: string;
  expiresAt: string | null;
}

export interface RegenerateInviteResult {
  invite: InviteDto;
}
