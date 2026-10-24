import type { AuditAction, AuditLogPage, MemberDto, RoleDto } from '@ping/shared';
import { api } from '@/lib/api-client';

export interface AuditLogFilters {
  action?: AuditAction;
  actorId?: string;
}

/** Một trang nhật ký (cursor `after` = id bản ghi cuối trang trước, ADR-0028). */
export const listAuditLog = (serverId: string, filters: AuditLogFilters = {}, after?: string) => {
  const params = new URLSearchParams();
  if (filters.action) params.set('action', filters.action);
  if (filters.actorId) params.set('actorId', filters.actorId);
  if (after) params.set('after', after);
  const query = params.toString();
  return api.get<AuditLogPage>(`/servers/${serverId}/audit-log${query ? `?${query}` : ''}`);
};

/** Danh sách vai trò của server (cần quyền `manage Role`). */
export const listRoles = (serverId: string) => api.get<RoleDto[]>(`/servers/${serverId}/roles`);

export interface CreateRoleInput {
  name: string;
  /** Bitmask dạng chuỗi thập phân. */
  permissions?: string;
  position?: number;
}

/** Tạo vai trò mới (T3.3). */
export const createRole = (serverId: string, input: CreateRoleInput) =>
  api.post<RoleDto>(`/servers/${serverId}/roles`, input);

/** Gán danh sách vai trò cho một thành viên; `@everyone` do API tự giữ. */
export const assignMemberRoles = (serverId: string, memberId: string, roleIds: string[]) =>
  api.put<MemberDto>(`/servers/${serverId}/members/${memberId}/roles`, { roleIds });

/** Sửa vai trò. `permissions` là bitmask dạng chuỗi thập phân (JSON không có bigint). */
export const updateRole = (
  roleId: string,
  input: { name?: string; permissions?: string; position?: number },
) => api.patch<RoleDto>(`/roles/${roleId}`, input);

export const deleteRole = (roleId: string) => api.delete<{ id: string }>(`/roles/${roleId}`);

/** Kick thành viên (T3.4). API kiểm tra thứ bậc; `204` không có body. */
export const kickMember = (serverId: string, memberId: string) =>
  api.delete<void>(`/servers/${serverId}/members/${memberId}`);

/** Xoá server — chỉ chủ server (API tự kiểm tra). */
export const deleteServer = (serverId: string) =>
  api.delete<{ id: string }>(`/servers/${serverId}`);
