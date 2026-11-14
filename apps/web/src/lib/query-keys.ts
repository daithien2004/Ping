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
  /**
   * ADR-0077: unread của MỌI server trong một query (GET /users/me/unread). Các hook
   * `useUnread(serverId)` cùng trỏ key này và chọn phần của server mình — TanStack gộp
   * thành một request, thay cho `qk.unread(serverId)` bắn N request.
   */
  unreadAll: ['unread', 'all'] as const,
  search: (serverId: string) => ['servers', serverId, 'search'] as const,
  messages: (channelId: string) => ['channels', channelId, 'messages'] as const,
  reactionUsers: (messageId: string, emoji: string) =>
    ['messages', messageId, 'reactions', emoji] as const,
  pins: (channelId: string) => ['channels', channelId, 'pins'] as const,
  stickers: (serverId: string) => ['servers', serverId, 'stickers'] as const,
  emojis: (serverId: string) => ['servers', serverId, 'emojis'] as const,
  gifSearch: (query: string) => ['gifs', 'search', query] as const,
  gifTrending: ['gifs', 'trending'] as const,
  /**
   * TG.9: danh sách DM của người gọi (GET /dms) — key phẳng vì DM không thuộc server nào.
   * Tin trong DM vẫn dùng `qk.messages(channelId)` như channel thường (ADR-0070 mục 8).
   */
  dms: ['dms'] as const,
  notificationPrefs: ['notification-prefs'] as const,
  settings: ['settings'] as const,
  blockedUsers: ['blocked-users'] as const,
  privacy: ['privacy'] as const,
  sessions: ['sessions'] as const,
};
