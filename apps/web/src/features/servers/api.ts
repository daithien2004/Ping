import type {
  CreateServerInput,
  JoinServerInput,
  JoinServerResponse,
  ServerDetail,
  ServerSummary,
  UpdateServerInput,
  UpdateServerResult,
} from '@ping/shared';
import { api } from '@/lib/api-client';

export const listServers = () => api.get<ServerSummary[]>('/servers');

export const getServer = (serverId: string) => api.get<ServerDetail>(`/servers/${serverId}`);

export const updateServer = (serverId: string, input: UpdateServerInput) =>
  api.patch<UpdateServerResult>(`/servers/${serverId}`, input);

export const createServer = (input: CreateServerInput) => api.post<ServerDetail>('/servers', input);

export const joinServer = (input: JoinServerInput) =>
  api.post<JoinServerResponse>('/servers/join', input);

export const leaveServer = (serverId: string) => api.post<void>(`/servers/${serverId}/leave`);
