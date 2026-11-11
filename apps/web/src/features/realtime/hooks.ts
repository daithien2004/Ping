'use client';
import { useStore } from 'zustand';
import { useRealtime } from './context';

export function useConnectionStatus() {
  return useStore(useRealtime().store, (s) => s.status);
}

export function useTypingCount(channelId: string) {
  return useStore(useRealtime().store, (s) => Object.keys(s.typing[channelId] ?? {}).length);
}
