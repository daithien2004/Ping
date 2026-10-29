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

/**
 * POST /dms — get-or-create idempotent: cặp đã có trả 200 với channel cũ nên không có 409.
 * Response của API là một `DmSummary`; ở đây chỉ cần `channelId` để điều hướng nên parse tối
 * thiểu — danh sách đầy đủ được invalidate và fetch lại ngay sau đó.
 */
export const createDm = (input: { userId: string }): Promise<{ channelId: string }> => {
  const body = createDmSchema.parse(input);
  return api.post<{ channelId: string }>('/dms', body, z.object({ channelId: z.uuid() }).loose());
};

/**
 * Chặn/bỏ chặn người dùng (TG.9): `POST`/`DELETE /users/:id/block` — idempotent, 204 không
 * body. Trang cài đặt TG.13 đọc danh sách qua `listBlocks` bên dưới; store UI của TG.9 vẫn
 * giữ chiều "mình đã chặn ai" cho thẻ hồ sơ và nhận chiều ngược lại qua 403 `DM_BLOCKED`.
 */
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

/** GET /users/me/blocks (TG.13) — danh sách người TÔI đã chặn, mới nhất trước. */
export const listBlocks = (): Promise<BlockedUsersResponse> =>
  api.get<BlockedUsersResponse>('/users/me/blocks', blockedUsersResponseSchema);

const userPrivacySchema: z.ZodType<UserPrivacyDto> = z.object({
  dmAllow: z.enum(['server_members', 'none']),
});

/** GET /users/me/privacy (TG.13) — mức nhận DM đã lưu, để switch cài đặt hiển thị đúng. */
export const getPrivacy = (): Promise<UserPrivacyDto> =>
  api.get<UserPrivacyDto>('/users/me/privacy', userPrivacySchema);

/**
 * PATCH /users/me/privacy — mức cho phép DM của chính mình (`dmAllow`, mục 11 của ADR-0070).
 */
export const updatePrivacy = (input: UpdatePrivacyInput) =>
  api.patch<void>('/users/me/privacy', input);
