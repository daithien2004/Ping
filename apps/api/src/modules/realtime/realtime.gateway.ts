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
  ErrorCodes,
  type ChannelJoinResult,
  type ServerToClientEvents,
} from '@ping/shared';
import { Logger } from 'nestjs-pino';
import { Server, Socket } from 'socket.io';
import { MetricsService } from '../../infra/metrics/metrics.service.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AbilityFactory } from '../ability/ability.factory.js';
import { AuthService } from '../auth/auth.service.js';
import { RealtimeService } from './realtime.service.js';

/** Khoảng tối thiểu giữa hai event typing của một socket. */
const TYPING_INTERVAL_MS = 1000;

/**
 * Ngân sách event của MỘT socket trong cửa sổ 1 giây (ADR-0027): quá mức mềm thì bỏ qua event,
 * quá mức cứng thì ngắt socket. Client của ta gửi vài event mỗi giây là cùng; ngưỡng rộng hơn hẳn.
 * Bộ đếm nằm trong socket.data vì trạng thái này gắn với một kết nối sống trên đúng một instance.
 */
const EVENT_WINDOW_MS = 1000;
const EVENT_SOFT_LIMIT = 20;
const EVENT_HARD_LIMIT = 60;
/** Số socket đồng thời tối đa của một user (mọi tab, mọi instance). */
const MAX_SOCKETS_PER_USER = 10;

type AuthSocket = Socket & {
  data: {
    // socket.data được serialize khi instance khác gọi fetchSockets(): chỉ để dữ liệu JSON thuần.
    userId?: string;
    lastTypingAt?: number;
    eventWindow?: { start: number; count: number };
  };
};

// CORS được cấu hình trong RedisIoAdapter (lấy từ ConfigService), không ở đây.
@WebSocketGateway({ namespace: '/', transports: ['websocket'] })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  // Serialize room commands per socket. Promises must never enter serializable socket.data.
  private readonly roomCommands = new WeakMap<AuthSocket, Promise<unknown>>();
  @WebSocketServer()
  server!: Server<ServerToClientEvents>;

  private readonly logger: Logger;

  constructor(
    private readonly authService: AuthService,
    private readonly jwt: JwtService,
    private readonly prisma: PrismaService,
    private readonly abilityFactory: AbilityFactory,
    private readonly realtimeService: RealtimeService,
    private readonly metrics: MetricsService,
    logger: Logger,
  ) {
    this.logger = logger;
  }

  afterInit(server: Server<ServerToClientEvents>): void {
    this.realtimeService.attach(server);
    // Authenticate before the client receives `connect` and can send channel.join.
    server.use((socket, next) => {
      const token = this.extractToken(socket);
      if (!token) {
        next(new Error(ErrorCodes.UNAUTHORIZED));
        return;
      }
      void this.authService.verifyAccessToken(token).then(
        (payload) => {
          socket.data.userId = payload.userId;
          next();
        },
        () => {
          this.logger.warn({ sid: socket.id }, 'ws: auth failed');
          next(new Error(ErrorCodes.UNAUTHORIZED));
        },
      );
    });
  }

  async handleConnection(@ConnectedSocket() socket: AuthSocket): Promise<void> {
    this.metrics.socketOpened(); // cặp với socketClosed() ở handleDisconnect: mọi socket đều qua cả hai
    try {
      const token = this.extractToken(socket);
      if (!token) {
        this.logger.warn({ sid: socket.id }, 'ws: missing access token');
        socket.disconnect(true);
        return;
      }

      const userId = socket.data.userId;
      if (!userId) {
        socket.disconnect(true);
        return;
      }
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
      await socket.join(`user:${userId}`);
      if (await this.tooManySockets(userId)) {
        this.logger.warn({ sid: socket.id, userId }, 'ws: too many sockets for this user');
        socket.disconnect(true);
        return;
      }

      // Phát online ở MỌI lần kết nối: idempotent với client, và tránh đua khi hai tab
      // cùng kết nối (cả hai cùng thấy "đã có 2 socket" thì không ai báo online).
      // Presence là best-effort (như chiều ngắt ở handleDisconnect): khi pool Postgres cạn lúc nhiều người
      // nối cùng lúc, truy vấn này quá hạn. Người dùng đã xác thực xong thì không bị ngắt vì thế.
      try {
        await this.broadcastPresence(userId, 'online');
      } catch (error) {
        this.logger.warn(
          { sid: socket.id, userId, err: (error as Error).message },
          'ws: presence update skipped',
        );
      }
      this.logger.debug({ sid: socket.id, userId }, 'ws: connected');
    } catch (error) {
      // Xác thực đã xong ở middleware; tới đây là lỗi thiết lập kết nối (join room, đếm socket).
      this.logger.warn(
        { sid: socket.id, err: (error as Error).message },
        'ws: connect setup failed',
      );
      socket.disconnect(true);
    }
  }

  async handleDisconnect(@ConnectedSocket() socket: AuthSocket): Promise<void> {
    this.metrics.socketClosed();
    const userId = socket.data.userId;
    if (!userId) {
      return;
    }
    try {
      // Socket đã rời mọi room khi tới đây: còn 0 socket nghĩa là tab cuối vừa đóng.
      if ((await this.realtimeService.countUserSockets(userId)) === 0) {
        await this.broadcastPresence(userId, 'offline');
      }
      this.logger.debug({ sid: socket.id, userId }, 'ws: disconnected');
    } catch (error) {
      // Nest không await handler này: để lỗi bay ra là unhandled rejection. Redis/Postgres chỉ
      // đóng SAU Socket.IO (ADR-0026) nên lúc tắt app lỗi này hiếm; còn khi hạ tầng hỏng giữa chừng
      // thì presence bị bỏ qua chứ không được làm sập tiến trình.
      this.logger.warn(
        { sid: socket.id, userId, err: (error as Error).message },
        'ws: presence update skipped',
      );
    }
  }

  @SubscribeMessage(ClientEvents.ChannelJoin)
  async handleChannelJoin(
    @ConnectedSocket() socket: AuthSocket,
    @MessageBody() body: unknown,
  ): Promise<ChannelJoinResult> {
    if (this.overBudget(socket)) {
      return { ok: false, code: ErrorCodes.TOO_MANY_REQUESTS };
    }
    return this.enqueueRoomCommand(socket, () => this.joinChannel(socket, body));
  }

  private async joinChannel(socket: AuthSocket, body: unknown): Promise<ChannelJoinResult> {
    const denied = { ok: false, code: ErrorCodes.FORBIDDEN } as const;
    const userId = socket.data.userId;
    const parsed = channelEventSchema.safeParse(body);
    if (!userId || !parsed.success) {
      return denied;
    }
    const { channelId } = parsed.data;

    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { serverId: true },
    });
    if (!channel) {
      return denied;
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
    // Same denial for unknown channels and missing access: do not disclose existence.
    if (!canView) {
      await socket.leave(`channel:${channelId}`);
      return denied;
    }
    if (!socket.connected) return denied;
    await socket.join([`channel:${channelId}`, `server:${channel.serverId}`]);
    return { ok: true };
  }

  @SubscribeMessage(ClientEvents.ChannelLeave)
  async handleChannelLeave(
    @ConnectedSocket() socket: AuthSocket,
    @MessageBody() body: unknown,
  ): Promise<void> {
    if (this.overBudget(socket)) {
      return;
    }
    const parsed = channelEventSchema.safeParse(body);
    if (parsed.success) {
      await this.enqueueRoomCommand(socket, () => socket.leave(`channel:${parsed.data.channelId}`));
    }
  }

  /** Tính một event vào ngân sách của socket. true = bỏ qua event này (đã ngắt socket nếu quá cứng). */
  private overBudget(socket: AuthSocket): boolean {
    const now = Date.now();
    const window = socket.data.eventWindow;
    if (!window || now - window.start >= EVENT_WINDOW_MS) {
      socket.data.eventWindow = { start: now, count: 1 };
      return false;
    }
    window.count += 1;
    if (window.count > EVENT_HARD_LIMIT) {
      this.logger.warn(
        { sid: socket.id, userId: socket.data.userId },
        'ws: event flood, disconnecting',
      );
      socket.disconnect(true);
      return true;
    }
    return window.count > EVENT_SOFT_LIMIT;
  }

  /** Socket hiện tại đã nằm trong room user nên được đếm. Lỗi đếm (Redis) → cho qua, không chặn nhầm. */
  private async tooManySockets(userId: string): Promise<boolean> {
    try {
      return (await this.realtimeService.countUserSockets(userId)) > MAX_SOCKETS_PER_USER;
    } catch {
      return false;
    }
  }

  private enqueueRoomCommand<T>(socket: AuthSocket, command: () => T | Promise<T>): Promise<T> {
    const task = (this.roomCommands.get(socket) ?? Promise.resolve()).then(command);
    this.roomCommands.set(
      socket,
      task.catch(() => undefined),
    );
    return task;
  }

  @SubscribeMessage(ClientEvents.Typing)
  handleTyping(@ConnectedSocket() socket: AuthSocket, @MessageBody() body: unknown): void {
    if (this.overBudget(socket)) {
      return;
    }
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
