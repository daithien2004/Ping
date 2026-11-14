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
  ChannelActivity: 'channel.activity',
  TypingStarted: 'typing.started',
  PresenceUpdated: 'presence.updated',
  PermissionsChanged: 'permissions.changed',
  MemberRemoved: 'member.removed',
  ReadUpdated: 'read.updated',
  MentionCreated: 'mention.created',
  ReactionAdded: 'reaction.added',
  ReactionRemoved: 'reaction.removed',
  MessagePinned: 'message.pinned',
  MessageUnpinned: 'message.unpinned',
  ExpressionsUpdated: 'expressions.updated',
  UserUpdated: 'user.updated',
  MemberUpdated: 'member.updated',
  ServerUpdated: 'server.updated',
  MemberBanned: 'member.banned',
  ChannelReordered: 'channel.reordered',
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
  kind?: 'text' | 'sticker' | 'gif';
  sticker?: import('./schemas/sticker').MessageStickerPreview | null;
  gif?: import('./schemas/gif').MessageGifPreview | null;
  attachments?: import('./schemas/attachment').AttachmentDto[];
  id: string;
  channelId: string;
  authorId: string;
  author: MessageAuthor;
  content: string;
  createdAt: string;
  nonce: string | null;
  replyTo: import('./schemas/message').MessageReplyPreview | null;
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

export interface ReactionChangedPayload {
  messageId: string;
  channelId: string;
  emoji: string;
  userId: string;
  count: number;
}

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

export interface PermissionsChangedPayload {
  serverId: string;
}

/** `banned: true` chỉ có khi vừa bị BAN; kick/leave/server-delete không đặt cờ. */
export interface MemberRemovedPayload {
  serverId: string;
  banned?: boolean;
}

export interface PresenceUpdatedPayload {
  userId: string;
  status: 'online' | 'offline';
}

export interface ReadUpdatedPayload {
  channelId: string;
  lastReadMessageId: string;
}

export interface MentionCreatedPayload {
  messageId: string;
  channelId: string;
  serverId: string;
}

/** CHỈ metadata, không nội dung: nội dung chỉ đi room `channel:<id>` sau kiểm quyền. */
export interface ChannelActivityPayload {
  channelId: string;
  serverId: string | null;
  messageId: string;
  authorId: string;
}

export interface MessagePinnedPayload {
  messageId: string;
  channelId: string;
  pinnedById: string;
  pinnedAt: string;
}

export interface MessageUnpinnedPayload {
  messageId: string;
  channelId: string;
}

export interface UserUpdatedPayload {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
}

export interface MemberUpdatedPayload {
  serverId: string;
  memberId: string;
  nickname: string | null;
  user: { id: string; displayName: string; avatarUrl: string | null };
}

/** Event riêng, không dùng `member.removed` (web coi đó là mình mất quyền truy cập); không kèm reason. */
export interface MemberBannedPayload {
  serverId: string;
  userId: string;
}

export interface ExpressionsUpdatedPayload {
  serverId: string;
}

export interface ServerUpdatedPayload {
  id: string;
  name: string;
  iconUrl: string | null;
}

/**
 * categories: `channelIds` là các categoryId theo thứ tự mới.
 * category: `categoryId` là nhóm đích (null = vùng mặc định), `channelIds` là channelId.
 */
export interface ChannelReorderedPayload {
  serverId: string;
  scope: 'categories' | 'category';
  categoryId?: string | null;
  channelIds: string[];
}

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
  [ServerEvents.ChannelActivity]: (payload: ChannelActivityPayload) => void;
  [ServerEvents.ReactionAdded]: (payload: ReactionChangedPayload) => void;
  [ServerEvents.ReactionRemoved]: (payload: ReactionChangedPayload) => void;
  [ServerEvents.MessagePinned]: (payload: MessagePinnedPayload) => void;
  [ServerEvents.MessageUnpinned]: (payload: MessageUnpinnedPayload) => void;
  [ServerEvents.ExpressionsUpdated]: (payload: ExpressionsUpdatedPayload) => void;
  [ServerEvents.UserUpdated]: (payload: UserUpdatedPayload) => void;
  [ServerEvents.MemberUpdated]: (payload: MemberUpdatedPayload) => void;
  [ServerEvents.ServerUpdated]: (payload: ServerUpdatedPayload) => void;
  [ServerEvents.MemberBanned]: (payload: MemberBannedPayload) => void;
  [ServerEvents.ChannelReordered]: (payload: ChannelReorderedPayload) => void;
}

export interface ClientToServerEvents {
  [ClientEvents.ChannelJoin]: (
    payload: ChannelJoinPayload,
    ack: (result: ChannelJoinResult) => void,
  ) => void;
  [ClientEvents.ChannelLeave]: (payload: ChannelLeavePayload) => void;
  [ClientEvents.Typing]: (payload: TypingPayload) => void;
}
