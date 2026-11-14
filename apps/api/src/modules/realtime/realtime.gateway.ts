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
import { ConfigService } from '@nestjs/config';
import { Logger } from 'nestjs-pino';
import { Server, Socket } from 'socket.io';
import { MetricsService } from '../../infra/metrics/metrics.service.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AbilityFactory } from '../ability/ability.factory.js';
import { AuthService } from '../auth/auth.service.js';
import { RealtimeService } from './realtime.service.js';

const TYPING_INTERVAL_MS = 1000;

const EVENT_WINDOW_MS = 1000;
const EVENT_SOFT_LIMIT = 20;
const EVENT_HARD_LIMIT = 60;
const MAX_SOCKETS_PER_USER = 10;

type AuthSocket = Socket & {
  data: {
    // socket.data được serialize khi instance khác gọi fetchSockets(): chỉ để dữ liệu JSON thuần.
    userId?: string;
    lastTypingAt?: number;
    eventWindow?: { start: number; count: number };
  };
};

@WebSocketGateway({ namespace: '/', transports: ['websocket'] })
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  // Serialize room commands per socket. Promises must never enter serializable socket.data.
  private readonly roomCommands = new WeakMap<AuthSocket, Promise<unknown>>();
  private readonly presencePending = new Map<string, Map<string, 'online' | 'offline'>>();
  private readonly presenceTimers = new Map<string, NodeJS.Timeout>();
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
    private readonly config: ConfigService,
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
    this.metrics.socketOpened(); // cặp với socketClosed() ở handleDisconnect
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
      // JWT chỉ kiểm lúc handshake: ngắt đúng lúc token hết hạn, client refresh rồi nối lại.
      const exp = this.jwt.decode<{ exp?: number } | null>(token)?.exp;
      if (exp !== undefined) {
        const timer = setTimeout(
          () => socket.disconnect(true),
          Math.max(0, exp * 1000 - Date.now()),
        );
        socket.once('disconnect', () => clearTimeout(timer));
      }
      await socket.join(`user:${userId}`);
      try {
        const memberships = await this.prisma.member.findMany({
          where: { userId },
          select: { serverId: true },
        });
        if (memberships.length > 0) {
          await socket.join(memberships.map((row) => `server:${row.serverId}`));
        }
      } catch (error) {
        this.logger.warn(
          { sid: socket.id, userId, err: (error as Error).message },
          'ws: server room join skipped',
        );
      }
      if (await this.tooManySockets(userId)) {
        this.logger.warn({ sid: socket.id, userId }, 'ws: too many sockets for this user');
        socket.disconnect(true);
        return;
      }

      // Phát online ở MỌI lần kết nối để tránh đua khi hai tab nối cùng lúc; best-effort, pool Postgres cạn thì bỏ qua.
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
      if ((await this.realtimeService.countUserSockets(userId)) === 0) {
        await this.broadcastPresence(userId, 'offline');
      }
      this.logger.debug({ sid: socket.id, userId }, 'ws: disconnected');
    } catch (error) {
      // Nest không await handler này: lỗi bay ra là unhandled rejection, presence phải bị bỏ qua chứ không làm sập tiến trình.
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
      select: { id: true, serverId: true, type: true },
    });
    if (!channel) {
      return denied;
    }

    // DM: kiểm DmParticipant, chỉ join room channel (không join room server).
    if (channel.type === 'DM') {
      const participant = await this.prisma.dmParticipant.findUnique({
        where: { channelId_userId: { channelId, userId } },
        select: { userId: true },
      });
      if (!participant) {
        // Cùng từ chối cho DM không tồn tại và không phải participant — không lộ tồn tại.
        await socket.leave(`channel:${channelId}`);
        return denied;
      }
      if (!socket.connected) return denied;
      await socket.join(`channel:${channelId}`);
      return { ok: true };
    }

    if (channel.serverId === null) return denied;
    let canView: boolean;
    try {
      const ability = await this.abilityFactory.createForUser(channel.serverId, userId);
      canView = ability.can('view', 'Message');
    } catch (error) {
      if (!(error instanceof ForbiddenException)) {
        throw error;
      }
      canView = false;
    }
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
    const memberships = await this.prisma.member.findMany({
      where: { userId },
      select: { serverId: true },
    });
    const batchMs = this.config.get('PRESENCE_BATCH_MS', { infer: true }) ?? 1000;
    if (batchMs === 0) {
      for (const membership of memberships) {
        this.server.to(`server:${membership.serverId}`).emit(ServerEvents.PresenceUpdated, {
          userId,
          status,
        });
      }
      return;
    }
    for (const membership of memberships) {
      const serverId = membership.serverId;
      let pending = this.presencePending.get(serverId);
      if (!pending) {
        pending = new Map();
        this.presencePending.set(serverId, pending);
      }
      pending.set(userId, status);
      if (!this.presenceTimers.has(serverId)) {
        const timer = setTimeout(() => this.flushPresence(serverId), batchMs);
        this.presenceTimers.set(serverId, timer);
      }
    }
  }

  private flushPresence(serverId: string): void {
    const pending = this.presencePending.get(serverId);
    this.presencePending.delete(serverId);
    const timer = this.presenceTimers.get(serverId);
    if (timer) clearTimeout(timer);
    this.presenceTimers.delete(serverId);
    if (!pending) return;
    for (const [userId, status] of pending) {
      this.server.to(`server:${serverId}`).emit(ServerEvents.PresenceUpdated, {
        userId,
        status,
      });
    }
  }
}
