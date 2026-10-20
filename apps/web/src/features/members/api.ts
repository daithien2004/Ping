import type { MemberPage } from '@ping/shared';
import { api } from '@/lib/api-client';

/** Một trang thành viên (cursor `after` = id thành viên cuối trang trước, ADR-0028). */
export const listMembers = (serverId: string, after?: string) =>
  api.get<MemberPage>(
    `/servers/${serverId}/members${after ? `?after=${encodeURIComponent(after)}` : ''}`,
  );
