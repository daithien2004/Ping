import {
  ClientEvents,
  PRESENCE_WATCH_BATCH_MAX,
  PRESENCE_WATCH_PER_SOCKET_MAX,
  type PresenceWatchResult,
} from '@ping/shared';
import type { RealtimeSocket } from '@/features/realtime/socket';

function chunks<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += PRESENCE_WATCH_BATCH_MAX) {
    out.push(items.slice(i, i + PRESENCE_WATCH_BATCH_MAX));
  }
  return out;
}

/**
 * Giữ danh sách thành viên đang hiển thị khớp với các room `presence:<userId>` của socket (ADR-0091).
 * Room mất khi socket nối lại nên `connect` gửi lại toàn bộ; đăng ký lỗi thì bỏ khỏi `sent` để lần
 * `set`/`connect` sau thử lại.
 */
export class PresenceWatcher {
  private readonly sent = new Set<string>();
  private desired: string[] = [];
  private disposed = false;

  constructor(
    private readonly socket: RealtimeSocket,
    private readonly serverId: string,
    private readonly onOnline: (userIds: string[]) => void,
  ) {
    socket.on('connect', this.onConnect);
  }

  set(userIds: string[]) {
    this.desired = userIds.slice(0, PRESENCE_WATCH_PER_SOCKET_MAX);
    if (this.socket.connected) this.sync();
  }

  dispose() {
    this.disposed = true;
    this.socket.off('connect', this.onConnect);
    if (this.socket.connected) this.unwatch([...this.sent]);
    this.sent.clear();
  }

  private onConnect = () => {
    this.sent.clear();
    this.sync();
  };

  private unwatch(userIds: string[]) {
    for (const batch of chunks(userIds)) {
      this.socket.emit(ClientEvents.PresenceUnwatch, { userIds: batch });
    }
  }

  private sync() {
    const want = new Set(this.desired);
    const drop = [...this.sent].filter((id) => !want.has(id));
    this.unwatch(drop);
    for (const id of drop) this.sent.delete(id);

    for (const batch of chunks(this.desired.filter((id) => !this.sent.has(id)))) {
      for (const id of batch) this.sent.add(id);
      this.socket
        .timeout(5000)
        .emit(
          ClientEvents.PresenceWatch,
          { serverId: this.serverId, userIds: batch },
          (error: Error | null, result: PresenceWatchResult) => {
            if (this.disposed) return;
            if (error || !result?.ok) {
              for (const id of batch) this.sent.delete(id);
              return;
            }
            if (result.online.length > 0) this.onOnline(result.online);
          },
        );
    }
  }
}
