import { myServerPermissionsSchema } from '@ping/shared';
import { api } from '@/lib/api-client';

export const getServerPermissions = (serverId: string) =>
  api.get(`/servers/${serverId}/me/permissions`, myServerPermissionsSchema);
