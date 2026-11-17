import { ForbiddenException, Injectable } from '@nestjs/common';
import {
  ServerEvents,
  channelRoom,
  presenceRoom,
  serverRoom,
  userRoom,
  type ServerToClientEvents,
} from '@ping/shared';
import { Server } from 'socket.io';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { RedisProvider } from '../../infra/redis/redis.module.js';
import { AbilityFactory } from '../ability/ability.factory.js';

type EventName = keyof ServerToClientEvents;
type Payload<K extends EventName> = Parameters<ServerToClientEvents[K]>[0];

@Injectable()
export class RealtimeService {
  private server: Server<ServerToClientEvents> | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly abilityFactory: AbilityFactory,
    private readonly redis: RedisProvider,
  ) {}

  attach(server: Server<ServerToClientEvents>): void {
    this.server = server;
  }

  emitToChannel<T extends EventName>(channelId: string, event: T, payload: Payload<T>): void {
    if (!this.server) {
      return;
    }
    const room = this.server.to(channelRoom(channelId)) as unknown as {
      emit: (e: unknown, p: unknown) => void;
    };
    void room.emit(event, payload);
  }

  emitToServer<T extends EventName>(serverId: string, event: T, payload: Payload<T>): void {
    if (!this.server) {
      return;
    }
    const room = this.server.to(serverRoom(serverId)) as unknown as {
      emit: (e: unknown, p: unknown) => void;
    };
    void room.emit(event, payload);
  }

  emitToUser<T extends EventName>(userId: string, event: T, payload: Payload<T>): void {
    if (!this.server) {
      return;
    }
    const room = this.server.to(userRoom(userId)) as unknown as {
      emit: (e: unknown, p: unknown) => void;
    };
    void room.emit(event, payload);
  }

  async countUserSockets(userId: string): Promise<number> {
    if (!this.server) {
      return 0;
    }
    const room = this.server.in(userRoom(userId));
    // Redis chết: fetchSockets() hỏi các instance khác qua pub/sub và sẽ chờ tới 5 giây rồi lỗi.
    // Đếm riêng instance này thay vì chờ (presence suy giảm, không chậm).
    return (await (this.redis.isUp ? room : room.local).fetchSockets()).length;
  }

  async onlineUserIds(userIds: string[]): Promise<Set<string>> {
    if (!this.server || userIds.length === 0) {
      return new Set();
    }
    const rooms = this.server.in(userIds.map((id) => userRoom(id)));
    const sockets = await (this.redis.isUp ? rooms : rooms.local).fetchSockets();
    return new Set(sockets.map((socket) => socket.data.userId as string));
  }

  // Quyền chỉ kiểm lúc `channel.join` nên khi quyền đổi phải chủ động đá socket khỏi room.
  async refreshAccess(
    serverId: string,
    userIds?: string[],
    opts?: { banned?: boolean },
  ): Promise<void> {
    if (!this.server) {
      return;
    }
    const channels = await this.prisma.channel.findMany({
      where: { serverId },
      select: { id: true },
    });
    const channelRooms = channels.map((channel) => channelRoom(channel.id));
    const targets =
      userIds ??
      (await this.prisma.member.findMany({ where: { serverId }, select: { userId: true } })).map(
        (member) => member.userId,
      );

    // ponytail: một lần dựng ability cho mỗi member (có cache Redis); server rất đông thì
    // chỉ xét member mang role vừa đổi, hoặc đẩy việc này vào hàng đợi.
    let memberPresenceRooms: string[] | undefined;
    for (const userId of targets) {
      const access = await this.accessOf(serverId, userId);
      const sockets = this.server.in(userRoom(userId));
      if (access === 'removed') {
        // Người bị loại không còn được theo dõi presence của các thành viên server này.
        // ponytail: O(số member) lúc kick/ban (hiếm); server rất đông thì lưu serverId trong tên room.
        memberPresenceRooms ??= (
          await this.prisma.member.findMany({ where: { serverId }, select: { userId: true } })
        ).map((member) => presenceRoom(member.userId));
        sockets.socketsLeave([...channelRooms, serverRoom(serverId), ...memberPresenceRooms]);
        this.server.to(userRoom(userId)).emit(ServerEvents.MemberRemoved, {
          serverId,
          ...(opts?.banned ? { banned: true } : {}),
        });
        continue;
      }
      if (access === 'no-view') {
        sockets.socketsLeave(channelRooms);
      }
      this.server.to(userRoom(userId)).emit(ServerEvents.PermissionsChanged, { serverId });
    }
  }

  notifyServerDeleted(serverId: string, userIds: string[]): void {
    if (!this.server) {
      return;
    }
    const presenceRooms = userIds.map(presenceRoom);
    for (const userId of userIds) {
      this.server.in(userRoom(userId)).socketsLeave([serverRoom(serverId), ...presenceRooms]);
      this.server.to(userRoom(userId)).emit(ServerEvents.MemberRemoved, { serverId });
    }
  }

  private async accessOf(
    serverId: string,
    userId: string,
  ): Promise<'view' | 'no-view' | 'removed'> {
    try {
      const ability = await this.abilityFactory.createForUser(serverId, userId);
      return ability.can('view', 'Message') ? 'view' : 'no-view';
    } catch (error) {
      if (error instanceof ForbiddenException) {
        return 'removed';
      }
      throw error;
    }
  }
}
