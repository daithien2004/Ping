import type { ClientToServerEvents, ServerToClientEvents } from '@ping/shared';
import { io, type Socket } from 'socket.io-client';
import { getAccessToken } from '@/lib/api-client';
import { env } from '@/lib/env';

export type RealtimeSocket = Socket<ServerToClientEvents, ClientToServerEvents>;
export function createSocket(): RealtimeSocket {
  return io(env.NEXT_PUBLIC_API_URL, {
    autoConnect: false,
    transports: ['websocket'],
    // Nối lại có jitter: API/Redis restart làm mọi tab thử lại cùng một nhịp và dội API. Giãn
    // dần tới 10 s, mỗi lần lệch ngẫu nhiên ±50% quanh mốc — các client rải đều thay vì đồng loạt.
    reconnectionDelay: 1_000,
    reconnectionDelayMax: 10_000,
    randomizationFactor: 0.5,
    auth: (cb) => cb({ token: getAccessToken() }),
  });
}
