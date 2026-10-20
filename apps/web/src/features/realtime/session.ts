import { ClientEvents, type ChannelJoinResult } from '@ping/shared';
import { expireSession, refreshAccessToken } from '@/lib/api-client';
import type { RealtimeSocket } from './socket';
import { createRealtimeStore } from './store';
import { TYPING_INTERVAL_MS } from './typing-state';

interface Room {
  serverId: string;
  channelId: string;
  synced: () => void;
  denied: () => void;
  generation: number;
  ready: boolean;
  lastTypingAt: number;
  retry?: ReturnType<typeof setTimeout>;
}

/** One instance per signed-in UI. No message/server data is stored here. */
export class RealtimeSession {
  readonly store = createRealtimeStore();
  private running = false;
  private generation = 0;
  private refreshing = false;
  private refreshedSinceConnect = false;
  private recovery?: ReturnType<typeof setTimeout>;
  private expiry?: ReturnType<typeof setInterval>;
  private rooms = new Map<string, Room>();
  private visited = new Map<string, Set<string>>();

  constructor(
    readonly socket: RealtimeSocket,
    private readonly refresh = refreshAccessToken,
    private readonly expired = expireSession,
  ) {}

  get active() {
    return this.running;
  }

  start() {
    this.running = true;
    this.generation++;
    this.store.getState().setStatus('connecting');
    this.socket.on('connect', this.onConnect);
    this.socket.on('disconnect', this.onDisconnect);
    this.socket.on('connect_error', this.onError);
    this.expiry = setInterval(() => this.store.getState().expire(), 1000);
    this.socket.connect();
  }

  stop() {
    this.running = false;
    this.generation++;
    this.refreshing = false;
    clearTimeout(this.recovery);
    clearInterval(this.expiry);
    for (const room of this.rooms.values()) {
      clearTimeout(room.retry);
      room.generation++;
      room.ready = false;
    }
    this.socket.off('connect', this.onConnect);
    this.socket.off('disconnect', this.onDisconnect);
    this.socket.off('connect_error', this.onError);
    this.socket.disconnect();
    this.store.getState().reset();
  }

  watch(serverId: string, channelId: string, synced: () => void, denied: () => void) {
    const room: Room = {
      serverId,
      channelId,
      synced,
      denied,
      generation: 0,
      ready: false,
      lastTypingAt: -Infinity,
    };
    this.rooms.set(channelId, room);
    const channels = this.visited.get(serverId) ?? new Set<string>();
    channels.add(channelId);
    this.visited.set(serverId, channels);
    if (this.running && this.socket.connected) this.join(room);
    return () => {
      if (this.rooms.get(channelId) !== room) return;
      this.rooms.delete(channelId);
      room.generation++;
      clearTimeout(room.retry);
      this.store.getState().clearChannel(channelId);
      if (this.socket.connected) this.socket.emit(ClientEvents.ChannelLeave, { channelId });
    };
  }

  channelsForServer(serverId: string): string[] {
    return [...(this.visited.get(serverId) ?? [])];
  }
  channelsForServerIds(): string[] {
    return [...this.visited.keys()];
  }

  revoke(serverId: string) {
    for (const room of this.rooms.values()) {
      if (room.serverId !== serverId) continue;
      clearTimeout(room.retry);
      room.generation++;
      room.ready = false;
      this.rooms.delete(room.channelId);
      this.store.getState().clearChannel(room.channelId);
      if (this.socket.connected)
        this.socket.emit(ClientEvents.ChannelLeave, { channelId: room.channelId });
    }
  }

  rejoin(serverId: string) {
    if (!this.socket.connected) return;
    for (const room of this.rooms.values()) if (room.serverId === serverId) this.join(room);
  }

  type(channelId: string) {
    const room = this.rooms.get(channelId);
    const now = Date.now();
    if (!this.socket.connected || !room?.ready || now - room.lastTypingAt < TYPING_INTERVAL_MS)
      return;
    room.lastTypingAt = now;
    this.socket.volatile.emit(ClientEvents.Typing, { channelId });
  }

  private join(room: Room) {
    clearTimeout(room.retry);
    room.ready = false;
    const generation = ++room.generation;
    this.socket
      .timeout(5000)
      .emit(
        ClientEvents.ChannelJoin,
        { channelId: room.channelId },
        (error: Error | null, result: ChannelJoinResult) => {
          if (
            !this.running ||
            this.rooms.get(room.channelId) !== room ||
            generation !== room.generation ||
            !this.socket.connected
          )
            return;
          if (error) {
            room.retry = setTimeout(() => this.join(room), 2000);
          } else if (result?.ok) {
            room.ready = true;
            this.store.getState().setRoomError(room.channelId, false);
            room.synced();
          } else {
            this.store.getState().setRoomError(room.channelId, true);
            room.denied();
          }
        },
      );
  }

  private onConnect = () => {
    this.refreshedSinceConnect = false;
    this.store.getState().setStatus('connected');
    for (const room of this.rooms.values()) this.join(room);
  };

  private onDisconnect = (reason: string) => {
    this.store.getState().setStatus('disconnected');
    for (const room of this.rooms.values()) {
      room.generation++;
      room.ready = false;
      clearTimeout(room.retry);
    }
    if (reason === 'io server disconnect') void this.recover();
  };

  private onError = () => {
    this.store.getState().setStatus('disconnected');
    if (!this.socket.active && this.refreshedSinceConnect) {
      this.expired();
      return;
    }
    if (!this.socket.active) void this.recover();
  };

  private async recover() {
    if (!this.running || this.refreshing) return;
    this.refreshing = true;
    const generation = this.generation;
    try {
      const token = await this.refresh();
      if (!this.running || generation !== this.generation) return;
      if (!token) {
        this.expired();
        return;
      }
      this.refreshedSinceConnect = true;
      this.socket.connect();
    } catch {
      if (this.running && generation === this.generation)
        this.recovery = setTimeout(() => void this.recover(), 2000);
    } finally {
      if (generation === this.generation) this.refreshing = false;
    }
  }
}
