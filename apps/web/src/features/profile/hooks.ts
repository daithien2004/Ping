'use client';
import {
  ErrorCodes,
  ServerEvents,
  type MemberUpdatedPayload,
  type ServerDetail,
  type ServerSummary,
  type ServerUpdatedPayload,
  type UpdateNicknameInput,
  type UpdateProfileInput,
  type UploadDto,
  type UserUpdatedPayload,
} from '@ping/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useEffectEvent, useRef, useState } from 'react';
import type { MembersCache } from '@/features/members/member-cache';
import type { MessagesCache } from '@/features/messages/message-cache';
import type { RealtimeSession } from '@/features/realtime/session';
import { api, ApiError } from '@/lib/api-client';
import { env } from '@/lib/env';
import { qk } from '@/lib/query-keys';
import { updateMyNickname, updateProfile, type ProfileUpdated } from './api';
import {
  applyMemberUpdated,
  applyServerUpdated,
  applyUserUpdatedToMembers,
  applyUserUpdatedToMessages,
} from './profile-cache';

/** PATCH /users/me — ghi thẳng vào cache `me` để rail/popover đổi ngay không cần reload. */
export function useUpdateProfile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProfileInput) => updateProfile(input),
    onSuccess: (user) =>
      queryClient.setQueryData<ProfileUpdated | null>(qk.me, (old) =>
        old ? { ...old, displayName: user.displayName, avatarUrl: user.avatarUrl } : old,
      ),
  });
}

/** PATCH /servers/:id/members/me — cập nhật cache members qua hàm thuần (có test). */
export function useUpdateNickname(serverId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateNicknameInput) => updateMyNickname(serverId, input),
    onSuccess: (result) => {
      const apply = (cache: MembersCache | undefined) =>
        applyMemberUpdated(cache, {
          serverId,
          memberId: result.id,
          nickname: result.nickname,
          user: result.user,
        });
      for (const query of queryClient.getQueryCache().findAll({ queryKey: qk.members(serverId) }))
        queryClient.setQueryData(
          query.queryKey,
          apply(query.state.data as MembersCache | undefined),
        );
    },
  });
}

export interface ProfileUpload {
  /** Đang có một tệp được chọn; người dùng chưa thể chọn tệp khác. */
  busy: boolean;
  progress: number;
  /** attachment `ready` — dùng làm avatarAttachmentId/iconAttachmentId. */
  attachmentId: string | null;
  error: unknown;
  /** Chọn tệp (input type=file) và bắt đầu luồng reserve → PUT → complete → chờ ready. */
  choose: (file: File | undefined) => void;
  reset: () => void;
}

/**
 * Upload một tệp hồ sơ qua pipeline TG.6 (ADR-0053): reserve → PUT nhị phân → complete →
 * poll tới `ready`. Luồng đi qua cùng khoá hạn mức, cùng worker kiểm định như tệp tin nhắn.
 * TG.22: scope `sticker` tái dùng đúng luồng này cho màn quản trị sticker của server.
 */
export function useProfileUpload(
  scope: 'avatar' | 'serverIcon' | 'sticker',
  serverId?: string,
): ProfileUpload {
  const [state, setState] = useState<{
    busy: boolean;
    progress: number;
    attachmentId: string | null;
    error: unknown;
  }>({ busy: false, progress: 0, attachmentId: null, error: undefined });
  // Không abort khi component unmount: modal đóng giữa chừng thì upload vẫn hoàn tất và
  // tệp không gắn sẽ được worker dọn như mồ côi (ADR-0053). Controller chỉ để hủy PUT/progress.
  const controllerRef = useRef<AbortController | null>(null);

  const choose = (file: File | undefined) => {
    if (!file || state.busy) return;
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ busy: true, progress: 0, attachmentId: null, error: undefined });
    void (async () => {
      try {
        const created = await api.post<UploadDto>('/uploads', {
          scope,
          ...(serverId ? { serverId } : {}),
          filename: file.name,
          sizeBytes: file.size,
          nonce: crypto.randomUUID(),
        });
        if (controller.signal.aborted) return;
        await api.upload(`/uploads/${created.id}/content`, file, controller.signal, (progress) =>
          setState((old) => ({ ...old, progress })),
        );
        if (controller.signal.aborted) return;
        await api.post(`/uploads/${created.id}/complete`);
        for (let i = 0; i < 40; i++) {
          if (controller.signal.aborted) return;
          const status = await api.get<UploadDto>(`/uploads/${created.id}`);
          if (status.status === 'ready') {
            setState({ busy: false, progress: 100, attachmentId: created.id, error: undefined });
            return;
          }
          if (['rejected', 'deleted', 'deleting'].includes(status.status))
            throw new ApiError(400, ErrorCodes.UPLOAD_INVALID, 'Invalid file');
          await new Promise((resolve) => setTimeout(resolve, 2000));
        }
        throw new ApiError(503, ErrorCodes.SERVICE_UNAVAILABLE, 'Processing timeout');
      } catch (error) {
        if (!controller.signal.aborted)
          setState({ busy: false, progress: 0, attachmentId: null, error });
      }
    })();
  };

  return {
    busy: state.busy,
    progress: state.progress,
    attachmentId: state.attachmentId,
    error: state.error,
    choose,
    reset: () => setState({ busy: false, progress: 0, attachmentId: null, error: undefined }),
  };
}

/**
 * user.updated / member.updated / server.updated (TG.7): hồ sơ và server đổi ở tab khác hoặc
 * do thành viên khác đổi — cập nhật cache me/members/messages/servers ngay không reload.
 */
export function useProfileEvents(session: RealtimeSession) {
  const queryClient = useQueryClient();
  const onUserUpdated = useEffectEvent((event: UserUpdatedPayload) => {
    queryClient.setQueryData<ProfileUpdated | null>(qk.me, (old) =>
      old && old.id === event.id
        ? { ...old, displayName: event.displayName, avatarUrl: event.avatarUrl }
        : old,
    );
    for (const query of queryClient
      .getQueryCache()
      .findAll({ type: 'active', predicate: (q) => q.queryKey[0] === 'channels' })) {
      queryClient.setQueryData<MessagesCache | undefined>(query.queryKey, (cache) =>
        applyUserUpdatedToMessages(cache, event),
      );
    }
    for (const query of queryClient
      .getQueryCache()
      .findAll({ predicate: (q) => q.queryKey[0] === 'servers' && q.queryKey[2] === 'members' })) {
      queryClient.setQueryData<MembersCache | undefined>(query.queryKey, (cache) =>
        applyUserUpdatedToMembers(cache, event),
      );
    }
  });
  const onMemberUpdated = useEffectEvent((event: MemberUpdatedPayload) => {
    for (const query of queryClient
      .getQueryCache()
      .findAll({ predicate: (q) => q.queryKey[0] === 'servers' && q.queryKey[2] === 'members' })) {
      queryClient.setQueryData<MembersCache | undefined>(query.queryKey, (cache) =>
        applyMemberUpdated(cache, event),
      );
    }
  });
  const onServerUpdated = useEffectEvent((event: ServerUpdatedPayload) => {
    const apply = (detail: ServerDetail | undefined, list: ServerSummary[] | undefined) =>
      applyServerUpdated(detail, list, event);
    queryClient.setQueryData<ServerDetail | undefined>(
      qk.server(event.id),
      (detail) => apply(detail, undefined).detail,
    );
    queryClient.setQueryData<ServerSummary[] | undefined>(
      qk.servers,
      (list) => apply(undefined, list).list,
    );
  });
  useEffect(() => {
    session.socket.on(ServerEvents.UserUpdated, onUserUpdated);
    session.socket.on(ServerEvents.MemberUpdated, onMemberUpdated);
    session.socket.on(ServerEvents.ServerUpdated, onServerUpdated);
    return () => {
      session.socket.off(ServerEvents.UserUpdated, onUserUpdated);
      session.socket.off(ServerEvents.MemberUpdated, onMemberUpdated);
      session.socket.off(ServerEvents.ServerUpdated, onServerUpdated);
    };
  }, [session.socket, onUserUpdated, onMemberUpdated, onServerUpdated]);
}

/** Dùng url gốc API cho URL hồ sơ tương đối (/api/v1/...): dev là :4000, prod là cùng origin. */
export function profileImageUrl(avatarUrl: string | null | undefined): string | undefined {
  if (!avatarUrl) return undefined;
  return avatarUrl.startsWith('http')
    ? avatarUrl
    : new URL(avatarUrl, env.NEXT_PUBLIC_API_URL).toString();
}
