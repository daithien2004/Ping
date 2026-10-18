import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { ClientEvents, ServerEvents, type ServerToClientEvents } from '@ping/shared';
import { Logger } from 'nestjs-pino';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AbilityFactory } from '../ability/ability.factory.js';
import { AuthService } from '../auth/auth.service.js';
import { RealtimeService } from './realtime.service.js';

type AuthSocket = Socket & {
  data: {
    userId?: string;
  };
};

@WebSocketGateway({
  namespace: '/',
  cors: {
    origin: process.env.WEB_ORIGIN,
    credentials: true,
  },
  transports: ['websocket'],
})
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server<ServerToClientEvents>;

  private readonly logger: Logger;

  constructor(
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
    private readonly abilityFactory: AbilityFactory,
    private readonly realtimeService: RealtimeService,
    logger: Logger,
  ) {
    this.logger = logger;
  }

  afterInit(server: Server<ServerToClientEvents>): void {
    this.realtimeService.attach(server);
  }

  async handleConnection(@ConnectedSocket() socket: AuthSocket): Promise<void> {
    try {
      const token = this.extractToken(socket);
      if (!token) {
        this.logger.warn({ sid: socket.id }, 'ws: missing access token');
        socket.disconnect(true);
        return;
      }

      const payload = await this.authService.verifyAccessToken(token);
      socket.data.userId = payload.userId;
      await socket.join(`user:${payload.userId}`);

      const count = await this.realtimeService.addUserConnection(payload.userId);
      if (count === 1) {
        await this.broadcastPresence(payload.userId, 'online');
      }
      this.logger.debug({ sid: socket.id, userId: payload.userId }, 'ws: connected');
    } catch (error) {
      this.logger.warn({ sid: socket.id, err: (error as Error).message }, 'ws: auth failed');
      socket.disconnect(true);
    }
  }

  async handleDisconnect(@ConnectedSocket() socket: AuthSocket): Promise<void> {
    const userId = socket.data.userId;
    if (!userId) {
      return;
    }
    const count = await this.realtimeService.removeUserConnection(userId);
    if (count === 0) {
      await this.broadcastPresence(userId, 'offline');
    }
    this.logger.debug({ sid: socket.id, userId }, 'ws: disconnected');
  }

  @SubscribeMessage(ClientEvents.ChannelJoin)
  async handleChannelJoin(
    @ConnectedSocket() socket: AuthSocket,
    @MessageBody() payload: { channelId: string } | undefined,
  ): Promise<void> {
    const userId = socket.data.userId;
    if (!userId) {
      socket.disconnect(true);
      return;
    }

    const channelId = payload?.channelId;
    if (!channelId) {
      return;
    }

    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { id: true, serverId: true },
    });
    if (!channel) {
      return;
    }

    try {
      // Chỉ member có quyền view channel mới được vào room để nhận message/typing.
      await this.abilityFactory.createForUser(channel.serverId, userId);
      await socket.join(`channel:${channelId}`);
      await socket.join(`server:${channel.serverId}`);
    } catch {
      // Không có quyền → im lặng hoặc có thể trả lỗi; lặng để tránh lộ server/channel.
    }
  }

  @SubscribeMessage(ClientEvents.ChannelLeave)
  async handleChannelLeave(
    @ConnectedSocket() socket: AuthSocket,
    @MessageBody() payload: { channelId: string } | undefined,
  ): Promise<void> {
    const channelId = payload?.channelId;
    if (channelId) {
      await socket.leave(`channel:${channelId}`);
    }
  }

  @SubscribeMessage(ClientEvents.Typing)
  async handleTyping(
    @ConnectedSocket() socket: AuthSocket,
    @MessageBody() payload: { channelId: string } | undefined,
  ): Promise<void> {
    const userId = socket.data.userId;
    const channelId = payload?.channelId;
    if (!userId || !channelId) {
      return;
    }
    this.server.to(`channel:${channelId}`).emit(ServerEvents.TypingStarted, {
      channelId,
      userId,
    });
  }

  private extractToken(socket: Socket): string | undefined {
    const auth = socket.handshake.auth as { token?: string } | undefined;
    if (auth?.token) {
      return auth.token;
    }
    const header = socket.handshake.headers.authorization;
    if (typeof header === 'string' && header.startsWith('Bearer ')) {
      return header.slice('Bearer '.length);
    }
    return undefined;
  }

  private async broadcastPresence(userId: string, status: 'online' | 'offline'): Promise<void> {
    // Phát presence đến các server mà user tham gia: tìm qua members.
    const memberships = await this.prisma.member.findMany({
      where: { userId },
      select: { serverId: true },
    });
    for (const membership of memberships) {
      this.server.to(`server:${membership.serverId}`).emit(ServerEvents.PresenceUpdated, {
        userId,
        status,
      });
    }
  }
}
