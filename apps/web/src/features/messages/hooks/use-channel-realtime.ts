'use client';
import { useEffect, useEffectEvent } from 'react';
import { useStore } from 'zustand';
import { useRealtime } from '@/features/realtime/context';
import { useChannelSync } from './use-channel-sync';

export function useChannelRealtime(serverId: string | null, channelId: string) {
  const session = useRealtime();
  const sync = useChannelSync(channelId);
  const onJoined = useEffectEvent(() => {
    void sync();
  });
  const onDenied = useEffectEvent(() => {
    void sync();
  });
  useEffect(
    () => session.watch(serverId, channelId, onJoined, onDenied),
    [session, serverId, channelId],
  );
  return useStore(session.store, (s) => s.roomErrors[channelId] === true);
}
