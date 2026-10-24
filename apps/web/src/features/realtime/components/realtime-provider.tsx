'use client';
import { ServerEvents, type TypingStartedPayload } from '@ping/shared';
import { useEffect, useState, type ReactNode } from 'react';
import { usePathname } from 'next/navigation';
import { useMe } from '@/features/auth/hooks';
import { useChannelEvents } from '@/features/channels/hooks';
import { useMemberPresence } from '@/features/members/hooks';
import { useMessageEvents } from '@/features/messages/hooks';
import { useServerEvents } from '@/features/servers/hooks';
import { useUnreadEvents } from '@/features/unread/hooks';
import { RealtimeContext } from '../context';
import { RealtimeSession } from '../session';
import { createSocket } from '../socket';

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
  // Channel đang xem (nếu có): unread của kênh này do mark-read lo, không tính badge (T4.3).
  const activeChannelId = /^\/servers\/[^/]+\/channels\/([^/]+)/.exec(pathname)?.[1];
  useMessageEvents(session);
  useChannelEvents(session);
  useServerEvents(session);
  useMemberPresence(session);
  useUnreadEvents(session, userId, activeChannelId);
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
