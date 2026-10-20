import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  canKickMember,
  Limits,
  Permissions,
  type ListMembersQuery,
  type MyServerPermissions,
} from '@ping/shared';
import { randomBytes } from 'node:crypto';
import { limitReached } from '../../common/limit-reached.js';
import { isUniqueConstraintError } from '../../common/utils/prisma-errors.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AbilityFactory } from '../ability/ability.factory.js';
import { AuditService } from '../audit/audit.module.js';
import { RealtimeService } from '../realtime/realtime.service.js';

/**
 * Tạo server trong MỘT lần insert lồng nhau (guide 10.1): server + role
 * `@everyone` + channel `general` + owner làm member — hoặc tất cả cùng thành
 * công, hoặc không gì cả (transaction ngầm của Prisma nested write).
 */
@Injectable()
export class ServersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilityFactory: AbilityFactory,
    private readonly realtime: RealtimeService,
    private readonly audit: AuditService,
  ) {}

  /** Trần mềm số server mỗi user tham gia (tính cả server tự tạo). */
  private async assertCanJoinAnotherServer(userId: string): Promise<void> {
    if ((await this.prisma.member.count({ where: { userId } })) >= Limits.MAX_SERVERS_PER_USER) {
      throw limitReached('servers', Limits.MAX_SERVERS_PER_USER);
    }
  }

  async create(userId: string, name: string) {
    await this.assertCanJoinAnotherServer(userId);
    const inviteCode = await this.generateUniqueInviteCode();

    // Transaction: server + role @everyone + channel general + owner là member
    // mang @everyone — hoặc tất cả cùng xong, hoặc không gì cả (guide 10.1).
    return this.prisma.$transaction(async (tx) => {
      const server = await tx.server.create({
        data: {
          name,
          ownerId: userId,
          inviteCode,
          roles: {
            create: {
              name: '@everyone',
              isDefault: true,
              permissions: Permissions.VIEW_CHANNEL | Permissions.SEND_MESSAGES,
            },
          },
          channels: { create: { name: 'general', position: 0 } },
        },
      });

      const everyone = await tx.role.findFirstOrThrow({
        where: { serverId: server.id, isDefault: true },
        select: { id: true },
      });

      // Owner cũng là member và cũng mang @everyone: không ai là "thành viên
      // đặc biệt" chỉ vì đã tạo server (quyền owner nằm ở Server.ownerId).
      await tx.member.create({
        data: {
          serverId: server.id,
          userId,
          roles: { create: { roleId: everyone.id } },
        },
      });

      return tx.server.findUniqueOrThrow({
        where: { id: server.id },
        include: {
          roles: { orderBy: { position: 'asc' } },
          channels: { orderBy: { position: 'asc' } },
        },
      });
    });
  }

  async listForUser(userId: string) {
    const servers = await this.prisma.server.findMany({
      where: { members: { some: { userId } } },
      include: { _count: { select: { members: true, channels: true } } },
      orderBy: { createdAt: 'asc' },
    });
    // Không đưa `_count` (chi tiết của Prisma) ra API: số đếm là trường phẳng camelCase (ADR-0028).
    return servers.map(({ _count, ...server }) => ({
      ...server,
      memberCount: _count.members,
      channelCount: _count.channels,
    }));
  }

  async detail(serverId: string) {
    const { _count, ...server } = await this.prisma.server.findUniqueOrThrow({
      where: { id: serverId },
      include: {
        channels: { orderBy: { position: 'asc' } },
        roles: { orderBy: { position: 'asc' } },
        _count: { select: { members: true } },
      },
    });
    return { ...server, memberCount: _count.members };
  }

  /** Dùng lại AbilityFactory (có cache, đã cộng @everyone): một nơi duy nhất tính quyền. */
  async myPermissions(serverId: string, userId: string): Promise<MyServerPermissions> {
    const { isOwner, permissions } = await this.abilityFactory.contextFor(serverId, userId);
    return { isOwner, permissions: permissions.toString() };
  }

  /**
   * Phân trang cursor (keyset) theo id thành viên tăng dần (UUIDv7: cũ → mới, cùng thứ tự `joinedAt`).
   * `after` thuộc server khác thì chỉ đơn giản không khớp hàng nào của server này, không lộ gì.
   */
  async members(serverId: string, { after, limit }: ListMembersQuery) {
    const rows = await this.prisma.member.findMany({
      where: { serverId, ...(after ? { id: { gt: after } } : {}) },
      include: {
        user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        roles: { select: { role: { select: { id: true, name: true } } } },
      },
      orderBy: { id: 'asc' },
      take: limit + 1, // lấy dư một hàng để biết còn trang sau
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const online = await this.realtime.onlineUserIds(page.map((row) => row.userId));
    return { members: page.map((row) => ({ ...row, online: online.has(row.userId) })), hasMore };
  }

  async join(userId: string, inviteCode: string) {
    const server = await this.prisma.server.findUnique({ where: { inviteCode } });
    if (!server) {
      throw new NotFoundException('Invalid invite code');
    }

    const existing = await this.prisma.member.findUnique({
      where: { serverId_userId: { serverId: server.id, userId } },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('You are already a member of this server');
    }
    await this.assertCanJoinAnotherServer(userId);

    const everyone = await this.prisma.role.findFirst({
      where: { serverId: server.id, isDefault: true },
      select: { id: true },
    });

    // Member mới luôn nhận role @everyone — không ai "vô hình" trong server.
    let member;
    try {
      member = await this.prisma.member.create({
        data: {
          serverId: server.id,
          userId,
          roles: everyone ? { create: { roleId: everyone.id } } : undefined,
        },
        include: { roles: { select: { role: { select: { id: true, name: true } } } } },
      });
    } catch (error) {
      // Hai request join đồng thời cùng lọt qua check `existing`: unique (serverId, userId) chặn.
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('You are already a member of this server');
      }
      throw error;
    }

    return { server: { id: server.id, name: server.name, inviteCode: server.inviteCode }, member };
  }

  async leave(serverId: string, userId: string): Promise<void> {
    const member = await this.prisma.member.findUnique({
      where: { serverId_userId: { serverId, userId } },
      include: { server: { select: { ownerId: true } } },
    });
    if (!member) {
      throw new NotFoundException('You are not a member of this server');
    }
    if (member.server.ownerId === userId) {
      throw new BadRequestException(
        'The owner cannot leave their own server — delete the server or transfer ownership first',
      );
    }

    await this.prisma.member.delete({ where: { id: member.id } });
    // Không còn member: cache ability của user trong server này phải chết ngay.
    await this.abilityFactory.invalidateMember(serverId, userId);
    // Socket đang mở của user phải rời room của server ngay, không đợi ngắt kết nối.
    await this.realtime.refreshAccess(serverId, [userId]);
  }

  /**
   * Kick: guard đã xác nhận người gọi có `delete Member` trong server này. Ở đây kiểm tra
   * theo đối tượng: member phải thuộc đúng server trên URL, và người bị kick không được
   * là owner, chính người gọi, hay người có quyền vượt người gọi (canKickMember).
   */
  async kick(serverId: string, actorId: string, memberId: string): Promise<void> {
    const member = await this.prisma.member.findUnique({
      where: { id: memberId },
      select: { id: true, serverId: true, userId: true },
    });
    // memberId của server khác gắn vào URL server này: coi như không tồn tại (không lộ thông tin).
    if (!member || member.serverId !== serverId) {
      throw new NotFoundException('Member not found in this server');
    }
    if (member.userId === actorId) {
      throw new BadRequestException('Use leave to remove yourself from a server');
    }

    const actor = await this.abilityFactory.contextFor(serverId, actorId);
    const target = await this.abilityFactory.contextFor(serverId, member.userId);
    if (!canKickMember(actor, target)) {
      throw new ForbiddenException('You cannot kick this member');
    }

    // Xóa member (MemberRole cascade theo) và ghi audit trong cùng một transaction.
    await this.prisma.$transaction([
      this.prisma.member.delete({ where: { id: member.id } }),
      this.audit.record({
        serverId,
        actorId,
        action: 'MEMBER_KICK',
        targetId: member.id,
        metadata: { userId: member.userId },
      }),
    ]);
    // Giống leave: quyền cache và socket room của người bị kick phải mất ngay.
    await this.abilityFactory.invalidateMember(serverId, member.userId);
    await this.realtime.refreshAccess(serverId, [member.userId]);
  }

  async remove(serverId: string, userId: string): Promise<{ id: string }> {
    const server = await this.prisma.server.findUnique({
      where: { id: serverId },
      select: { ownerId: true, name: true },
    });
    if (!server) {
      throw new NotFoundException('Server not found');
    }
    // Tier 2 (guide 10.2): xóa server là đặc quyền của CHỦ SỞ HỮU, không phải
    // một loại quyền role — nên check đối tượng ở đây thay vì @CheckAbility.
    if (server.ownerId !== userId) {
      throw new ForbiddenException('Only the owner can delete this server');
    }

    // Lấy danh sách member TRƯỚC khi cascade xóa họ, để còn báo cho họ qua socket.
    const memberUserIds = (
      await this.prisma.member.findMany({ where: { serverId }, select: { userId: true } })
    ).map((member) => member.userId);

    // Cascade trong schema dọn channels/messages/roles/members.
    // AuditLog không có khóa ngoại nên bản ghi này còn lại sau khi cascade dọn sạch server.
    await this.prisma.$transaction([
      this.prisma.server.delete({ where: { id: serverId } }),
      this.audit.record({
        serverId,
        actorId: userId,
        action: 'SERVER_DELETE',
        targetId: serverId,
        metadata: { name: server.name },
      }),
    ]);
    await this.abilityFactory.invalidateServer(serverId);
    this.realtime.notifyServerDeleted(serverId, memberUserIds);
    return { id: serverId };
  }

  /**
   * 6 byte ngẫu nhiên → 8 ký tự base64url (~48 bit): đủ ngắn để share, đủ rộng
   * để không đoán được. Vẫn kiểm tra trùng vì unique constraint là chốt chặn cuối.
   */
  private async generateUniqueInviteCode(): Promise<string> {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const code = randomBytes(6).toString('base64url');
      const taken = await this.prisma.server.findUnique({
        where: { inviteCode: code },
        select: { id: true },
      });
      if (!taken) {
        return code;
      }
    }
    throw new InternalServerErrorException('Could not allocate a unique invite code');
  }
}
