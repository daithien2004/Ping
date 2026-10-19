import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Permissions } from '@ping/shared';
import { randomBytes } from 'node:crypto';
import { isUniqueConstraintError } from '../../common/utils/prisma-errors.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AbilityFactory } from '../ability/ability.factory.js';
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
  ) {}

  async create(userId: string, name: string) {
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

  listForUser(userId: string) {
    return this.prisma.server.findMany({
      where: { members: { some: { userId } } },
      include: { _count: { select: { members: true, channels: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  detail(serverId: string) {
    return this.prisma.server.findUniqueOrThrow({
      where: { id: serverId },
      include: {
        channels: { orderBy: { position: 'asc' } },
        roles: { orderBy: { position: 'asc' } },
        _count: { select: { members: true } },
      },
    });
  }

  members(serverId: string) {
    return this.prisma.member.findMany({
      where: { serverId },
      include: {
        user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        roles: { select: { role: { select: { id: true, name: true } } } },
      },
      orderBy: { joinedAt: 'asc' },
    });
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

  async remove(serverId: string, userId: string): Promise<{ id: string }> {
    const server = await this.prisma.server.findUnique({
      where: { id: serverId },
      select: { ownerId: true },
    });
    if (!server) {
      throw new NotFoundException('Server not found');
    }
    // Tier 2 (guide 10.2): xóa server là đặc quyền của CHỦ SỞ HỮU, không phải
    // một loại quyền role — nên check đối tượng ở đây thay vì @CheckAbility.
    if (server.ownerId !== userId) {
      throw new ForbiddenException('Only the owner can delete this server');
    }

    // Cascade trong schema dọn channels/messages/roles/members.
    await this.prisma.server.delete({ where: { id: serverId } });
    await this.abilityFactory.invalidateServer(serverId);
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
