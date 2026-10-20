import type { ClientToServerEvents, ServerToClientEvents } from '@ping/shared';
import { io, type Socket } from 'socket.io-client';
import { getAccessToken } from '@/lib/api-client';
import { env } from '@/lib/env';

export type RealtimeSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
export function createSocket(): RealtimeSocket {
  return io(env.NEXT_PUBLIC_API_URL, {
    autoConnect: false,
    transports: ['websocket'],
    auth: (cb) => cb({ token: getAccessToken() }),
  });
}
