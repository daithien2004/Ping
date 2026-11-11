'use client';
import { useEffect, useEffectEvent } from 'react';
import { useStore } from 'zustand';
import { useChannelSync } from '@/features/messages/hooks';
import { useRealtime } from './context';

/**
 * Theo dõi channel khi component dùng hook được hiển thị, đồng bộ tin nhắn khi server phản hồi,
 * rồi trả về true nếu server từ chối cho vào channel.
 *
 * Ví dụ kết quả: false = chưa ghi nhận bị từ chối; true = bị từ chối.
 */
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

export function useConnectionStatus() {
  return useStore(useRealtime().store, (s) => s.status);
}

export function useTypingCount(channelId: string) {
  return useStore(useRealtime().store, (s) => Object.keys(s.typing[channelId] ?? {}).length);
}
