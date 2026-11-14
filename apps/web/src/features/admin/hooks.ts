'use client';

import type { AuditAction } from '@ping/shared';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { qk } from '@/lib/query-keys';
import {
  assignMemberRoles,
  createRole,
  deleteRole,
  deleteServer,
  kickMember,
  listAuditLog,
  listRoles,
  regenerateInvite,
  updateRole,
} from './api';
import type { AuditLogFilters, CreateRoleInput } from './api';

export function useAuditLog(serverId: string, filters: AuditLogFilters = {}) {
  return useInfiniteQuery({
    queryKey: [...qk.auditLog(serverId), filters.action ?? 'all', filters.actorId ?? 'all'],
    queryFn: ({ pageParam }) => listAuditLog(serverId, filters, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.entries.at(-1)?.id : undefined),
  });
}

export function useRoles(serverId: string, enabled = true) {
  return useQuery({
    queryKey: qk.roles(serverId),
    queryFn: () => listRoles(serverId),
    enabled,
  });
}

export function useUpdateRole(serverId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ roleId, ...input }: { roleId: string } & Parameters<typeof updateRole>[1]) =>
      updateRole(roleId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.roles(serverId) });
      void queryClient.invalidateQueries({ queryKey: qk.server(serverId) });
      void queryClient.invalidateQueries({ queryKey: qk.permissions(serverId) });
    },
  });
}

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
      void queryClient.invalidateQueries({ queryKey: qk.unreadAll });
    },
  });
}

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

export function useDeleteRole(serverId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (roleId: string) => deleteRole(roleId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.roles(serverId) });
      void queryClient.invalidateQueries({ queryKey: qk.server(serverId) });
      void queryClient.invalidateQueries({ queryKey: qk.unreadAll });
    },
  });
}

export function useKickMember(serverId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (memberId: string) => kickMember(serverId, memberId),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.members(serverId) });
      void queryClient.invalidateQueries({ queryKey: qk.roles(serverId) });
      void queryClient.invalidateQueries({ queryKey: qk.server(serverId) });
    },
  });
}

export function useRegenerateInvite(serverId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: { expiresInDays?: number }) => regenerateInvite(serverId, input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: qk.server(serverId) });
      void queryClient.invalidateQueries({ queryKey: qk.servers, exact: true });
    },
  });
}

export function useDeleteServer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (serverId: string) => deleteServer(serverId),
    onSuccess: (_result, serverId) => {
      void queryClient.removeQueries({ queryKey: qk.server(serverId) });
      void queryClient.invalidateQueries({ queryKey: qk.unreadAll });
      return queryClient.invalidateQueries({ queryKey: qk.servers, exact: true });
    },
  });
}

export type { AuditAction };
