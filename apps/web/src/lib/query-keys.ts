/**
 * Mọi query key của app nằm ở đây (hướng dẫn 12.3): không gõ tay mảng key trong component.
 * Key xếp theo cây — invalidate `qk.server(id)` làm mới cùng lúc channels, members, permissions
 * của server đó vì TanStack Query so khớp theo tiền tố.
 */
export const qk = {
  health: ['health'] as const,
  me: ['me'] as const,
  servers: ['servers'] as const,
  server: (serverId: string) => ['servers', serverId] as const,
  channels: (serverId: string) => ['servers', serverId, 'channels'] as const,
  members: (serverId: string) => ['servers', serverId, 'members'] as const,
  permissions: (serverId: string) => ['servers', serverId, 'permissions'] as const,
  roles: (serverId: string) => ['servers', serverId, 'roles'] as const,
  auditLog: (serverId: string) => ['servers', serverId, 'audit-log'] as const,
  unread: (serverId: string) => ['servers', serverId, 'unread'] as const,
  messages: (channelId: string) => ['channels', channelId, 'messages'] as const,
};
