import {
  createDmSchema,
  type BlockedUsersResponse,
  type DmListResponse,
  type DmSummary,
  type UpdatePrivacyInput,
  type UserPrivacyDto,
} from '@ping/shared';
import { z } from 'zod';
import { api } from '@/lib/api-client';

/**
 * TG.9 (ADR-0070): validator chạy-time cho `DmSummary`/`DmListResponse`. Shared giữ interface
 * (hợp đồng), còn shape trả về của API được parse zod tại biên như hướng dẫn 12.2 — chữ ký
 * khớp `packages/shared/src/schemas/dm.ts`, không định nghĩa lại kiểu.
 */
const messageAuthorSchema = z.object({
  id: z.uuid(),
  username: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
});

const dmSummarySchema: z.ZodType<DmSummary> = z.object({
  channelId: z.uuid(),
  partner: messageAuthorSchema,
  unreadCount: z.number().int().nonnegative(),
  lastReadMessageId: z.uuid().nullable(),
  lastMessageAt: z.string().nullable(),
});

const dmListResponseSchema: z.ZodType<DmListResponse> = z.object({
  dms: z.array(dmSummarySchema),
});

/** GET /dms — mọi DM của người gọi (mục 7 của ADR-0070), parse zod ở biên. */
export const listDms = (): Promise<DmListResponse> =>
  api.get<DmListResponse>('/dms', dmListResponseSchema);

export const createDm = (input: { userId: string }): Promise<{ channelId: string }> => {
  const body = createDmSchema.parse(input);
  return api.post<{ channelId: string }>('/dms', body, z.object({ channelId: z.uuid() }).loose());
};

export const blockUser = (userId: string) => api.post<void>(`/users/${userId}/block`);
export const unblockUser = (userId: string) => api.delete<void>(`/users/${userId}/block`);

const blockedUserSchema = z.object({
  userId: z.uuid(),
  username: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  blockedAt: z.iso.datetime({ offset: true }),
});

const blockedUsersResponseSchema: z.ZodType<BlockedUsersResponse> = z.object({
  blocked: z.array(blockedUserSchema),
});

export const listBlocks = (): Promise<BlockedUsersResponse> =>
  api.get<BlockedUsersResponse>('/users/me/blocks', blockedUsersResponseSchema);

const userPrivacySchema: z.ZodType<UserPrivacyDto> = z.object({
  dmAllow: z.enum(['server_members', 'none']),
});

export const getPrivacy = (): Promise<UserPrivacyDto> =>
  api.get<UserPrivacyDto>('/users/me/privacy', userPrivacySchema);

/**
 * PATCH /users/me/privacy — mức cho phép DM của chính mình (`dmAllow`, mục 11 của ADR-0070).
 */
export const updatePrivacy = (input: UpdatePrivacyInput) =>
  api.patch<void>('/users/me/privacy', input);
