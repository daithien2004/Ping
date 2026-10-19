import { ForbiddenException, Injectable } from '@nestjs/common';
import { ServerEvents, type ServerToClientEvents } from '@ping/shared';
import { Server } from 'socket.io';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AbilityFactory } from '../ability/ability.factory.js';

type EventName = keyof ServerToClientEvents;
type Payload<K extends EventName> = Parameters<ServerToClientEvents[K]>[0];

@Injectable()
export class RealtimeService {
  private server: Server<ServerToClientEvents> | undefined;

  constructor(
    private readonly prisma: PrismaService,
    private readonly abilityFactory: AbilityFactory,
  ) {}

  attach(server: Server<ServerToClientEvents>): void {
    this.server = server;
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

  /**
   * Số socket đang mở của user trên MỌI instance (Redis adapter hỏi các instance khác).
   * Đếm socket thật thay cho bộ đếm INCR/DECR: không lệch khi key hết TTL hay instance chết.
   */
  async countUserSockets(userId: string): Promise<number> {
    if (!this.server) {
      return 0;
    }
    return (await this.server.in(`user:${userId}`).fetchSockets()).length;
  }

  /**
   * Quyền chỉ được kiểm tra lúc `channel.join`, nên khi quyền đổi (rời server, bị kick, đổi role)
   * phải chủ động đá socket ra khỏi room — nếu không họ vẫn nhận tin tới khi ngắt kết nối —
   * và báo riêng cho user để client tải lại quyền hoặc rời server khỏi giao diện.
   * Không truyền `userIds` = xét mọi member của server (role đổi quyền ảnh hưởng nhiều người).
   */
  async refreshAccess(serverId: string, userIds?: string[]): Promise<void> {
    if (!this.server) {
      return;
    }
    const channels = await this.prisma.channel.findMany({
      where: { serverId },
      select: { id: true },
    });
    const channelRooms = channels.map((channel) => `channel:${channel.id}`);
    const targets =
      userIds ??
      (await this.prisma.member.findMany({ where: { serverId }, select: { userId: true } })).map(
        (member) => member.userId,
      );

    // ponytail: một lần dựng ability cho mỗi member (có cache Redis); server rất đông thì
    // chỉ xét member mang role vừa đổi, hoặc đẩy việc này vào hàng đợi.
    for (const userId of targets) {
      const access = await this.accessOf(serverId, userId);
      const sockets = this.server.in(`user:${userId}`);
      if (access === 'removed') {
        sockets.socketsLeave([...channelRooms, `server:${serverId}`]);
        this.server.to(`user:${userId}`).emit(ServerEvents.MemberRemoved, { serverId });
        continue;
      }
      if (access === 'no-view') {
        sockets.socketsLeave(channelRooms);
      }
      this.server.to(`user:${userId}`).emit(ServerEvents.PermissionsChanged, { serverId });
    }
  }

  /** Server bị xóa: không còn channel hay member để tra, chỉ báo cho những người từng ở trong đó. */
  notifyServerDeleted(serverId: string, userIds: string[]): void {
    if (!this.server) {
      return;
    }
    for (const userId of userIds) {
      this.server.in(`user:${userId}`).socketsLeave(`server:${serverId}`);
      this.server.to(`user:${userId}`).emit(ServerEvents.MemberRemoved, { serverId });
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
        return 'removed'; // không còn là member
      }
      throw error;
    }
  }
}
