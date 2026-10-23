import type { AuditAction, AuditLogPage, RoleDto } from '@ping/shared';
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

/** Sửa vai trò. `permissions` là bitmask dạng chuỗi thập phân (JSON không có bigint). */
export const updateRole = (roleId: string, input: { name?: string; permissions?: string }) =>
  api.patch<RoleDto>(`/roles/${roleId}`, input);

export const deleteRole = (roleId: string) => api.delete<{ id: string }>(`/roles/${roleId}`);

/** Xoá server — chỉ chủ server (API tự kiểm tra). */
export const deleteServer = (serverId: string) =>
  api.delete<{ id: string }>(`/servers/${serverId}`);
