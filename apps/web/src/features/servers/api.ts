import type {
  CreateServerInput,
  JoinServerInput,
  JoinServerResponse,
  ServerDetail,
  ServerSummary,
} from '@ping/shared';
import { api } from '@/lib/api-client';

export const listServers = () => api.get<ServerSummary[]>('/servers');

export const getServer = (serverId: string) => api.get<ServerDetail>(`/servers/${serverId}`);

/** Response đã gồm channel #general và role @everyone (tạo trong một transaction). */
export const createServer = (input: CreateServerInput) => api.post<ServerDetail>('/servers', input);

export const joinServer = (input: JoinServerInput) =>
  api.post<JoinServerResponse>('/servers/join', input);

export const leaveServer = (serverId: string) => api.post<void>(`/servers/${serverId}/leave`);
