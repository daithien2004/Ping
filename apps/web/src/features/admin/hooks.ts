'use client';

import type { AuditAction } from '@ping/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { qk } from '@/lib/query-keys';
import {
  assignMemberRoles,
  createRole,
  deleteRole,
  deleteServer,
  listAuditLog,
  listRoles,
  updateRole,
} from './api';
import type { AuditLogFilters, CreateRoleInput } from './api';

/**
 * Nhật ký hành động theo trang cursor. Bộ lọc nằm trong query key nên đổi bộ lọc là
 * một query mới (không trộn hai bộ lọc vào cùng danh sách).
 */
export function useAuditLog(serverId: string, filters: AuditLogFilters = {}) {
  return useInfiniteQuery({
    queryKey: [...qk.auditLog(serverId), filters.action ?? 'all', filters.actorId ?? 'all'],
    queryFn: ({ pageParam }) => listAuditLog(serverId, filters, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.entries.at(-1)?.id : undefined),
  });
}

/** Vai trò của server. Không suspend: màn quản trị tự hiện trạng thái tải/lỗi/quyền. */
export function useRoles(serverId: string, enabled = true) {
  return useQuery({
    queryKey: qk.roles(serverId),
    queryFn: () => listRoles(serverId),
    enabled,
  });
}

/** Lưu quyền (hoặc tên) của một vai trò. */
export function useUpdateRole(serverId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ roleId, ...input }: { roleId: string } & Parameters<typeof updateRole>[1]) =>
      updateRole(roleId, input),
    onSuccess: () => {
      // Quyền của role đổi → cache server (roles, permissions) và danh sách role phải mới.
      void queryClient.invalidateQueries({ queryKey: qk.roles(serverId) });
      void queryClient.invalidateQueries({ queryKey: qk.server(serverId) });
      void queryClient.invalidateQueries({ queryKey: qk.permissions(serverId) });
    },
  });
}

/** Tạo vai trò mới; vị trí do người gọi tính từ danh sách hiện tại. */
export function useCreateRole(serverId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateRoleInput) => createRole(serverId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.roles(serverId) });
      void queryClient.invalidateQueries({ queryKey: qk.server(serverId) });
    },
  });
}

/**
 * Gán vai trò cho thành viên. Đổi role làm đổi quyền hiệu lực nên phải làm mới cả
 * thành viên, vai trò (đếm member) và quyền của server.
 */
export function useAssignMemberRoles(serverId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ memberId, roleIds }: { memberId: string; roleIds: string[] }) =>
      assignMemberRoles(serverId, memberId, roleIds),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.members(serverId) });
      void queryClient.invalidateQueries({ queryKey: qk.roles(serverId) });
      void queryClient.invalidateQueries({ queryKey: qk.server(serverId) });
      void queryClient.invalidateQueries({ queryKey: qk.permissions(serverId) });
    },
  });
}

/**
 * Đổi thứ tự hiển thị: gửi các cập nhật `position` đã tính sẵn. API không có endpoint
 * đổi hàng loạt nên mỗi role một PATCH; danh sách role bị giới hạn bởi `Limits`.
 */
export function useReorderRoles(serverId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (updates: Array<{ id: string; position: number }>) =>
      Promise.all(updates.map(({ id, position }) => updateRole(id, { position }))),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.roles(serverId) });
      void queryClient.invalidateQueries({ queryKey: qk.server(serverId) });
    },
  });
}

/** Xoá vai trò (không xoá được @everyone — API trả lỗi rõ ràng). */
export function useDeleteRole(serverId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (roleId: string) => deleteRole(roleId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.roles(serverId) });
      void queryClient.invalidateQueries({ queryKey: qk.server(serverId) });
    },
  });
}

/** Xoá server (chỉ chủ server). */
export function useDeleteServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (serverId: string) => deleteServer(serverId),
    onSuccess: (_result, serverId) => {
      void queryClient.removeQueries({ queryKey: qk.server(serverId) });
      return queryClient.invalidateQueries({ queryKey: qk.servers, exact: true });
    },
  });
}

export type { AuditAction };
