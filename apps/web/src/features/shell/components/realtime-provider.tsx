'use client';
import { ServerEvents, type TypingStartedPayload } from '@ping/shared';
import { useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useMe } from '@/features/auth/hooks';
import { useChannelEvents } from '@/features/channels/hooks';
import { useDmEvents } from '@/features/dms/hooks';
import { useEmojiEvents } from '@/features/emojis/hooks';
import { useMemberPresence } from '@/features/members/hooks';
import { useMessageEvents } from '@/features/messages/hooks';
import { useNotificationEvents } from '@/features/notifications/events';
import { useProfileEvents } from '@/features/profile/hooks';
import { RealtimeContext } from '@/features/realtime/context';
import { RealtimeSession } from '@/features/realtime/session';
import { createSocket } from '@/features/realtime/socket';
import { useServerEvents } from '@/features/servers/hooks';
import { useUnreadEvents } from '@/features/unread/hooks';
import { channelIdFromPath } from '@/lib/channel-url';

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const { data: me } = useMe();
  return me ? (
    <SignedInRealtime key={me.id} userId={me.id}>
      {children}
    </SignedInRealtime>
  ) : null;
}

function SignedInRealtime({ userId, children }: { userId: string; children: ReactNode }) {
  const [session] = useState(() => new RealtimeSession(createSocket()));
  const pathname = usePathname();
  const activeChannelId = channelIdFromPath(pathname) ?? undefined;
  useMessageEvents(session);
  useChannelEvents(session);
  useServerEvents(session);
  useMemberPresence(session);
  useProfileEvents(session);
  useEmojiEvents(session);
  useUnreadEvents(session, userId, activeChannelId);
  useDmEvents(session, userId, activeChannelId);
  useNotificationEvents(session, userId);
  useEffect(() => {
    const typing = (event: TypingStartedPayload) => {
      if (event.userId !== userId) session.store.getState().type(event.channelId, event.userId);
    };
    session.socket.on(ServerEvents.TypingStarted, typing);
    session.start();
    return () => {
      session.socket.off(ServerEvents.TypingStarted, typing);
      session.stop();
    };
  }, [session, userId]);
  return <RealtimeContext value={session}>{children}</RealtimeContext>;
}
