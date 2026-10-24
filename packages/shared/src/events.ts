import { z } from 'zod';
import type { ErrorCode } from './errors';
import type { ChannelDto } from './schemas/channel';

export const ServerEvents = {
  MessageCreated: 'message.created',
  MessageUpdated: 'message.updated',
  MessageDeleted: 'message.deleted',
  ChannelCreated: 'channel.created',
  ChannelUpdated: 'channel.updated',
  ChannelDeleted: 'channel.deleted',
  TypingStarted: 'typing.started',
  PresenceUpdated: 'presence.updated',
  PermissionsChanged: 'permissions.changed',
  MemberRemoved: 'member.removed',
  ReadUpdated: 'read.updated',
  MentionCreated: 'mention.created',
} as const;

export const ClientEvents = {
  ChannelJoin: 'channel.join',
  ChannelLeave: 'channel.leave',
  Typing: 'typing.start',
} as const;

export interface MessageAuthor {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface MessageCreatedPayload {
  id: string;
  channelId: string;
  authorId: string;
  author: MessageAuthor;
  content: string;
  createdAt: string;
  /** Nonce của client gửi: khớp tin optimistic với tin thật. null với tin không có nonce. */
  nonce: string | null;
}

export interface MessageUpdatedPayload {
  id: string;
  channelId: string;
  content: string;
  updatedAt: string;
}

export interface MessageDeletedPayload {
  id: string;
  channelId: string;
}

/** Channel mới/đổi tên gửi tới room `server:<id>`; client cập nhật cache danh sách channel. */
export type ChannelCreatedPayload = ChannelDto;
export type ChannelUpdatedPayload = ChannelDto;

export interface ChannelDeletedPayload {
  id: string;
  serverId: string;
}

export interface TypingStartedPayload {
  channelId: string;
  userId: string;
}

/**
 * Gửi riêng tới user (room `user:<id>`): quyền của CHÍNH họ trong server có thể đã đổi
 * (role bị sửa/xóa, được gán role). Client tải lại quyền của server đó.
 */
export interface PermissionsChangedPayload {
  serverId: string;
}

/** Gửi riêng tới user: họ không còn là member của server (bị kick, tự rời, server bị xóa). */
export interface MemberRemovedPayload {
  serverId: string;
}

export interface PresenceUpdatedPayload {
  userId: string;
  status: 'online' | 'offline';
}

/**
 * Gửi riêng tới user (room `user:<id>`) khi họ đánh dấu đã đọc (T4.2): mọi tab/thiết bị
 * khác của cùng user cập nhật cursor theo — hai tab không tụt badge lệch nhau.
 */
export interface ReadUpdatedPayload {
  channelId: string;
  lastReadMessageId: string;
}

/**
 * Gửi riêng tới user được mention (T4.2). Event `message.created` vẫn phát broadcast tới
 * room channel (ranh giới quyền); event này chỉ tới người được nhắc nên không lộ danh sách
 * mention của người khác. Payload tối giản: client tự đối chiếu với tin đã nhận/theo badge.
 */
export interface MentionCreatedPayload {
  messageId: string;
  channelId: string;
  serverId: string;
}

/** Payload client gửi lên chỉ là dữ liệu chưa tin cậy: gateway parse bằng schema này. */
export const channelEventSchema = z.object({ channelId: z.uuid() });
export type ChannelJoinPayload = z.infer<typeof channelEventSchema>;
export type ChannelJoinResult = { ok: true } | { ok: false; code: ErrorCode };
export type ChannelLeavePayload = z.infer<typeof channelEventSchema>;
export type TypingPayload = z.infer<typeof channelEventSchema>;

export interface ServerToClientEvents {
  [ServerEvents.MessageCreated]: (payload: MessageCreatedPayload) => void;
  [ServerEvents.MessageUpdated]: (payload: MessageUpdatedPayload) => void;
  [ServerEvents.MessageDeleted]: (payload: MessageDeletedPayload) => void;
  [ServerEvents.ChannelCreated]: (payload: ChannelCreatedPayload) => void;
  [ServerEvents.ChannelUpdated]: (payload: ChannelUpdatedPayload) => void;
  [ServerEvents.ChannelDeleted]: (payload: ChannelDeletedPayload) => void;
  [ServerEvents.TypingStarted]: (payload: TypingStartedPayload) => void;
  [ServerEvents.PresenceUpdated]: (payload: PresenceUpdatedPayload) => void;
  [ServerEvents.PermissionsChanged]: (payload: PermissionsChangedPayload) => void;
  [ServerEvents.MemberRemoved]: (payload: MemberRemovedPayload) => void;
  [ServerEvents.ReadUpdated]: (payload: ReadUpdatedPayload) => void;
  [ServerEvents.MentionCreated]: (payload: MentionCreatedPayload) => void;
}

export interface ClientToServerEvents {
  [ClientEvents.ChannelJoin]: (
    payload: ChannelJoinPayload,
    ack: (result: ChannelJoinResult) => void,
  ) => void;
  [ClientEvents.ChannelLeave]: (payload: ChannelLeavePayload) => void;
  [ClientEvents.Typing]: (payload: TypingPayload) => void;
}
