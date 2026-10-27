import type { UpdateNicknameInput, UpdateProfileInput } from '@ping/shared';
import { api } from '@/lib/api-client';

/** PATCH /users/me trả về hồ sơ mới (đủ để ghi vào cache `me`). */
export interface ProfileUpdated {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  createdAt: string;
}

export const updateProfile = (input: UpdateProfileInput) =>
  api.patch<ProfileUpdated>('/users/me', input);

/** PATCH /servers/:serverId/members/me — biệt danh của chính mình (null = xóa). */
export interface MemberUpdatedResult {
  id: string;
  serverId: string;
  nickname: string | null;
  user: { id: string; displayName: string; avatarUrl: string | null };
}

export const updateMyNickname = (serverId: string, input: UpdateNicknameInput) =>
  api.patch<MemberUpdatedResult>(`/servers/${serverId}/members/me`, input);
