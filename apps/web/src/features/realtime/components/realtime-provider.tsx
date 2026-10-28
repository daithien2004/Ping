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
import { useProfileEvents } from '@/features/profile/hooks';
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
  // TG.9: DM ở route `/dms/:channelId` — badge riêng qua `useDmEvents`, cùng cơ chế "đang xem".
  const activeChannelId =
    /^\/servers\/[^/]+\/channels\/([^/]+)/.exec(pathname)?.[1] ??
    /^\/dms\/([^/]+)/.exec(pathname)?.[1];
  useMessageEvents(session);
  useChannelEvents(session);
  useServerEvents(session);
  useMemberPresence(session);
  useProfileEvents(session); // TG.7: user/member/server.updated cập nhật cache hồ sơ ngay.
  useEmojiEvents(session); // TG.24: expressions.updated invalidate emoji + sticker của server.
  useUnreadEvents(session, userId, activeChannelId);
  useDmEvents(session, userId, activeChannelId); // TG.9: badge DM qua `serverId: null`.
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
