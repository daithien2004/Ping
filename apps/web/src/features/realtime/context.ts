'use client';
import { createContext, useContext } from 'react';
import type { RealtimeSession } from './session';

export const RealtimeContext = createContext<RealtimeSession | null>(null);
export function useRealtime() {
  const session = useContext(RealtimeContext);
  if (!session) throw new Error('RealtimeProvider is required');
  return session;
}
