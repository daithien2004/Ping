import type { ClientToServerEvents, ServerToClientEvents } from '@ping/shared';
import { io, type Socket } from 'socket.io-client';
import { getAccessToken } from '@/lib/api-client';
import { env } from '@/lib/env';

export type RealtimeSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

/**
 * Gắn handler cho một sự kiện của server, trả về hàm gỡ. Chữ ký ràng buộc handler theo tên sự kiện;
 * bên trong phải ép kiểu vì socket.io không suy được kiểu listener khi tên sự kiện là tham số generic.
 */
export function onServerEvent<E extends keyof ServerToClientEvents>(
  socket: RealtimeSocket,
  event: E,
  handler: ServerToClientEvents[E],
): () => void {
  const loose = socket as unknown as {
    on: (event: string, handler: unknown) => void;
    off: (event: string, handler: unknown) => void;
  };
  loose.on(event, handler);
  return () => loose.off(event, handler);
}

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
