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
  search: (serverId: string) => ['servers', serverId, 'search'] as const,
  messages: (channelId: string) => ['channels', channelId, 'messages'] as const,
  /** TG.2: danh sách người thả một emoji trên một tin (phân trang keyset). */
  reactionUsers: (messageId: string, emoji: string) =>
    ['messages', messageId, 'reactions', emoji] as const,
  /** TG.3: danh sách tin đã ghim của một channel (trần 50, không phân trang). */
  pins: (channelId: string) => ['channels', channelId, 'pins'] as const,
  /** TG.22: gói sticker (hệ thống + của server) cho picker và màn quản trị. */
  stickers: (serverId: string) => ['servers', serverId, 'stickers'] as const,
  /** TG.24: emoji tùy chỉnh của server — picker, render tin/reaction và màn quản trị dùng chung. */
  emojis: (serverId: string) => ['servers', serverId, 'emojis'] as const,
  /** TG.25: tìm GIF qua cổng backend (key theo truy vấn đã trim/lowercase, không gọi nhà cung cấp trực tiếp). */
  gifSearch: (query: string) => ['gifs', 'search', query] as const,
  /** TG.25: GIF thịnh hành cho tab GIF khi chưa gõ gì (cache chung cho mọi channel). */
  gifTrending: ['gifs', 'trending'] as const,
  /**
   * TG.9: danh sách DM của người gọi (GET /dms) — key phẳng vì DM không thuộc server nào.
   * Tin trong DM vẫn dùng `qk.messages(channelId)` như channel thường (ADR-0070 mục 8).
   */
  dms: ['dms'] as const,
  /** TG.12: prefs thông báo của chính người gọi (một bản cho mọi server/channel, key phẳng). */
  notificationPrefs: ['notification-prefs'] as const,
};
