import { z } from 'zod';
import type { ErrorCode } from './errors';

export const ServerEvents = {
  MessageCreated: 'message.created',
  MessageUpdated: 'message.updated',
  MessageDeleted: 'message.deleted',
  TypingStarted: 'typing.started',
  PresenceUpdated: 'presence.updated',
  PermissionsChanged: 'permissions.changed',
  MemberRemoved: 'member.removed',
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
  [ServerEvents.TypingStarted]: (payload: TypingStartedPayload) => void;
  [ServerEvents.PresenceUpdated]: (payload: PresenceUpdatedPayload) => void;
  [ServerEvents.PermissionsChanged]: (payload: PermissionsChangedPayload) => void;
  [ServerEvents.MemberRemoved]: (payload: MemberRemovedPayload) => void;
}

export interface ClientToServerEvents {
  [ClientEvents.ChannelJoin]: (
    payload: ChannelJoinPayload,
    ack: (result: ChannelJoinResult) => void,
  ) => void;
  [ClientEvents.ChannelLeave]: (payload: ChannelLeavePayload) => void;
  [ClientEvents.Typing]: (payload: TypingPayload) => void;
}
