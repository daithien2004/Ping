import type {
  AuditAction,
  AuditLogPage,
  MemberDto,
  RegenerateInviteResult,
  RoleDto,
} from '@ping/shared';
import { api } from '@/lib/api-client';

export interface AuditLogFilters {
  action?: AuditAction;
  actorId?: string;
}

export const listAuditLog = (serverId: string, filters: AuditLogFilters = {}, after?: string) => {
  const params = new URLSearchParams();
  if (filters.action) params.set('action', filters.action);
  if (filters.actorId) params.set('actorId', filters.actorId);
  if (after) params.set('after', after);
  const query = params.toString();
  return api.get<AuditLogPage>(`/servers/${serverId}/audit-log${query ? `?${query}` : ''}`);
};

export const listRoles = (serverId: string) => api.get<RoleDto[]>(`/servers/${serverId}/roles`);

export interface CreateRoleInput {
  name: string;
  /** Bitmask dạng chuỗi thập phân. */
  permissions?: string;
  position?: number;
}

export const createRole = (serverId: string, input: CreateRoleInput) =>
  api.post<RoleDto>(`/servers/${serverId}/roles`, input);

export const assignMemberRoles = (serverId: string, memberId: string, roleIds: string[]) =>
  api.put<MemberDto>(`/servers/${serverId}/members/${memberId}/roles`, { roleIds });

export const updateRole = (
  roleId: string,
  input: { name?: string; permissions?: string; position?: number },
) => api.patch<RoleDto>(`/roles/${roleId}`, input);

export const deleteRole = (roleId: string) => api.delete<{ id: string }>(`/roles/${roleId}`);

export const kickMember = (serverId: string, memberId: string) =>
  api.delete<void>(`/servers/${serverId}/members/${memberId}`);

export const regenerateInvite = (serverId: string, input: { expiresInDays?: number }) =>
  api.post<RegenerateInviteResult>(`/servers/${serverId}/invite/regenerate`, input);

export const deleteServer = (serverId: string) =>
  api.delete<{ id: string }>(`/servers/${serverId}`);
