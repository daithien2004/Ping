import { ClientEvents, ServerEvents } from '../src/events';
import type { ClientToServerEvents, ServerToClientEvents } from '../src/events';

// Checked by tsc --noEmit, never invoked or included in the library bundle.
export function checkEventContracts(server: ServerToClientEvents, client: ClientToServerEvents) {
  server[ServerEvents.MessageCreated]({
    id: 'message-01',
    channelId: 'channel-01',
    authorId: 'user-A',
    content: 'Hello',
    createdAt: '2026-10-18T03:00:00.000Z',
  });
  server[ServerEvents.MessageUpdated]({
    id: 'message-01',
    channelId: 'channel-01',
    content: 'Updated',
    updatedAt: '2026-10-18T03:05:00.000Z',
  });
  server[ServerEvents.MessageDeleted]({ id: 'message-01', channelId: 'channel-01' });
  server[ServerEvents.TypingStarted]({ channelId: 'channel-01', userId: 'user-A' });
  server[ServerEvents.PresenceUpdated]({ userId: 'user-A', status: 'online' });
  server[ServerEvents.PresenceUpdated]({ userId: 'user-A', status: 'offline' });
  client[ClientEvents.ChannelJoin]({ channelId: 'channel-01' });
  client[ClientEvents.ChannelLeave]({ channelId: 'channel-01' });
  client[ClientEvents.Typing]({ channelId: 'channel-01' });

  // @ts-expect-error: Deletion events require the channel ID.
  server[ServerEvents.MessageDeleted]({ id: 'message-01' });
  // @ts-expect-error: Message content must be a string.
  server[ServerEvents.MessageUpdated]({ id: 'm', channelId: 'c', content: 123, updatedAt: 'now' });
  // @ts-expect-error: Presence accepts only online or offline.
  server[ServerEvents.PresenceUpdated]({ userId: 'user-A', status: 'onlien' });
  // @ts-expect-error: Client typing events do not accept a claimed identity.
  client[ClientEvents.Typing]({ channelId: 'channel-01', userId: 'user-B' });
  // @ts-expect-error: Joining requires a string channel ID.
  client[ClientEvents.ChannelJoin]({ channelId: 123 });
  // @ts-expect-error: Clients cannot send server-only message creation events.
  client[ServerEvents.MessageCreated]({ content: 'Hello' });
  // @ts-expect-error: Unknown event names must be rejected.
  server['message.create']({});
}
