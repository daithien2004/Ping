import { createStore } from 'zustand/vanilla';
import { addTyping, expireTyping, type TypingState } from './typing-state';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected';
export function createRealtimeStore() {
  return createStore<{
    status: ConnectionStatus;
    typing: TypingState;
    roomErrors: Record<string, boolean>;
    setRoomError: (channelId: string, denied: boolean) => void;
    setStatus: (status: ConnectionStatus) => void;
    type: (channelId: string, userId: string) => void;
    expire: () => void;
    clearChannel: (channelId: string) => void;
    reset: () => void;
  }>((set) => ({
    status: 'connecting',
    typing: {},
    roomErrors: {},
    setRoomError: (channelId, denied) =>
      set((s) => ({ roomErrors: { ...s.roomErrors, [channelId]: denied } })),
    setStatus: (status) => set({ status, ...(status !== 'connected' ? { typing: {} } : {}) }),
    type: (channelId, userId) =>
      set((s) => ({ typing: addTyping(s.typing, channelId, userId, Date.now()) })),
    expire: () => set((s) => ({ typing: expireTyping(s.typing, Date.now()) })),
    clearChannel: (channelId) =>
      set((s) => ({
        typing: Object.fromEntries(Object.entries(s.typing).filter(([id]) => id !== channelId)),
      })),
    reset: () => set({ status: 'disconnected', typing: {}, roomErrors: {} }),
  }));
}
