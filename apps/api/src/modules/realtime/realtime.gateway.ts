import { ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
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
import {
  ClientEvents,
  ServerEvents,
  channelEventSchema,
  type ServerToClientEvents,
} from '@ping/shared';
import { Logger } from 'nestjs-pino';
import { Server, Socket } from 'socket.io';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AbilityFactory } from '../ability/ability.factory.js';
import { AuthService } from '../auth/auth.service.js';
import { RealtimeService } from './realtime.service.js';

/** Khoảng tối thiểu giữa hai event typing của một socket. */
const TYPING_INTERVAL_MS = 1000;

type AuthSocket = Socket & {
  data: {
    // socket.data được serialize khi instance khác gọi fetchSockets(): chỉ để dữ liệu JSON thuần.
    userId?: string;
    lastTypingAt?: number;
  };
};

// CORS được cấu hình trong RedisIoAdapter (lấy từ ConfigService), không ở đây.
@WebSocketGateway({ namespace: '/', transports: ['websocket'] })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server!: Server<ServerToClientEvents>;

  private readonly logger: Logger;

  constructor(
    private readonly authService: AuthService,
    private readonly jwt: JwtService,
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
      // JWT chỉ được kiểm tra lúc handshake: ngắt socket đúng lúc token hết hạn,
      // client phải refresh rồi kết nối lại với token mới.
      const exp = this.jwt.decode<{ exp?: number } | null>(token)?.exp;
      if (exp !== undefined) {
        const timer = setTimeout(
          () => socket.disconnect(true),
          Math.max(0, exp * 1000 - Date.now()),
        );
        socket.once('disconnect', () => clearTimeout(timer));
      }
      await socket.join(`user:${payload.userId}`);

      // Phát online ở MỌI lần kết nối: idempotent với client, và tránh đua khi hai tab
      // cùng kết nối (cả hai cùng thấy "đã có 2 socket" thì không ai báo online).
      await this.broadcastPresence(payload.userId, 'online');
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
    // Socket đã rời mọi room khi tới đây: còn 0 socket nghĩa là tab cuối vừa đóng.
    if ((await this.realtimeService.countUserSockets(userId)) === 0) {
      await this.broadcastPresence(userId, 'offline');
    }
    this.logger.debug({ sid: socket.id, userId }, 'ws: disconnected');
  }

  @SubscribeMessage(ClientEvents.ChannelJoin)
  async handleChannelJoin(
    @ConnectedSocket() socket: AuthSocket,
    @MessageBody() body: unknown,
  ): Promise<void> {
    const userId = socket.data.userId;
    const parsed = channelEventSchema.safeParse(body);
    if (!userId || !parsed.success) {
      return;
    }
    const { channelId } = parsed.data;

    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { serverId: true },
    });
    if (!channel) {
      return;
    }

    let canView: boolean;
    try {
      const ability = await this.abilityFactory.createForUser(channel.serverId, userId);
      canView = ability.can('view', 'Message');
    } catch (error) {
      if (!(error instanceof ForbiddenException)) {
        throw error;
      }
      canView = false; // không phải member
    }
    // Im lặng khi không có quyền: không tiết lộ channel/server có tồn tại hay không.
    if (!canView) {
      return;
    }
    await socket.join([`channel:${channelId}`, `server:${channel.serverId}`]);
  }

  @SubscribeMessage(ClientEvents.ChannelLeave)
  async handleChannelLeave(
    @ConnectedSocket() socket: AuthSocket,
    @MessageBody() body: unknown,
  ): Promise<void> {
    const parsed = channelEventSchema.safeParse(body);
    if (parsed.success) {
      await socket.leave(`channel:${parsed.data.channelId}`);
    }
  }

  @SubscribeMessage(ClientEvents.Typing)
  handleTyping(@ConnectedSocket() socket: AuthSocket, @MessageBody() body: unknown): void {
    const userId = socket.data.userId;
    const parsed = channelEventSchema.safeParse(body);
    if (!userId || !parsed.success) {
      return;
    }
    const room = `channel:${parsed.data.channelId}`;
    // Chỉ người đang ở trong room (đã qua kiểm tra quyền lúc join) mới được báo đang gõ.
    if (!socket.rooms.has(room)) {
      return;
    }
    const now = Date.now();
    if (now - (socket.data.lastTypingAt ?? 0) < TYPING_INTERVAL_MS) {
      return;
    }
    socket.data.lastTypingAt = now;
    this.server.to(room).emit(ServerEvents.TypingStarted, {
      channelId: parsed.data.channelId,
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
