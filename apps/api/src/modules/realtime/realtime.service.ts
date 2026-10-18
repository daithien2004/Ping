import { Injectable } from '@nestjs/common';
import type { ServerToClientEvents } from '@ping/shared';
import { Server } from 'socket.io';
import { RedisProvider } from '../../infra/redis/redis.module.js';

type EventName = keyof ServerToClientEvents;
type Payload<K extends EventName> = Parameters<ServerToClientEvents[K]>[0];

@Injectable()
export class RealtimeService {
  private server: Server<ServerToClientEvents> | undefined;

  constructor(private readonly redis: RedisProvider) {}

  attach(server: Server<ServerToClientEvents>): void {
    this.server = server;
    // Chỉ sử dụng các room được kiểm soát, không broadcast toàn cục.
  }

  emitToUser<T extends EventName>(userId: string, event: T, payload: Payload<T>): void {
    if (!this.server) {
      return;
    }
    const room = this.server.to(`user:${userId}`) as unknown as {
      emit: (e: unknown, p: unknown) => void;
    };
    void room.emit(event, payload);
  }

  emitToServer<T extends EventName>(serverId: string, event: T, payload: Payload<T>): void {
    if (!this.server) {
      return;
    }
    const room = this.server.to(`server:${serverId}`) as unknown as {
      emit: (e: unknown, p: unknown) => void;
    };
    void room.emit(event, payload);
  }

  emitToChannel<T extends EventName>(channelId: string, event: T, payload: Payload<T>): void {
    if (!this.server) {
      return;
    }
    const room = this.server.to(`channel:${channelId}`) as unknown as {
      emit: (e: unknown, p: unknown) => void;
    };
    void room.emit(event, payload);
  }

  async addUserConnection(userId: string): Promise<number> {
    const key = this.userConnectionKey(userId);
    const count = await this.redis.incr(key);
    // Giữ tồn tại ít nhất 5 phút, làm mới khi còn kết nối.
    await this.redis.expire(key, 300);
    return count;
  }

  async removeUserConnection(userId: string): Promise<number> {
    const key = this.userConnectionKey(userId);
    const count = await this.redis.decr(key);
    if (count <= 0) {
      await this.redis.del(key);
      return 0;
    }
    await this.redis.expire(key, 300);
    return count;
  }

  async isUserOnline(userId: string): Promise<boolean> {
    const count = await this.redis.get(this.userConnectionKey(userId));
    return count !== null && Number.parseInt(count, 10) > 0;
  }

  private userConnectionKey(userId: string): string {
    return `presence:user:${userId}`;
  }
}
