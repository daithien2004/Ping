import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  GoneException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  canKickMember,
  ErrorCodes,
  Limits,
  Permissions,
  ServerEvents,
  type ListMembersQuery,
  type MyServerPermissions,
  type RegenerateInviteInput,
  type RegenerateInviteResult,
} from '@ping/shared';
import { randomBytes } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';
import { limitReached } from '../../common/limit-reached.js';
import { isUniqueConstraintError } from '../../common/utils/prisma-errors.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AbilityFactory } from '../ability/ability.factory.js';
import { AttachmentsService } from '../attachments/attachments.service.js';
import { AuditService } from '../audit/audit.service.js';
import { compareRanks } from '../categories/ranks.js';
import { verifyRequired } from '../auth/account.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';

@Injectable()
export class ServersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilityFactory: AbilityFactory,
    private readonly realtime: RealtimeService,
    private readonly audit: AuditService,
    private readonly attachments: AttachmentsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private async assertCanJoinAnotherServer(userId: string): Promise<void> {
    if ((await this.prisma.member.count({ where: { userId } })) >= Limits.MAX_SERVERS_PER_USER) {
      throw limitReached('servers', Limits.MAX_SERVERS_PER_USER);
    }
  }

  // Đặt ở SERVICE chứ không phải defineAbilityFor: là điều kiện hồ sơ, không phải luật role. CHỈ áp dụng khi có
  // `SMTP_URL`: không có mailer thì user không thể tự xác minh, chặn là khóa vĩnh viễn.
  private async assertEmailVerified(userId: string): Promise<void> {
    if (!this.config.get('SMTP_URL', { infer: true })) return;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { emailVerified: true },
    });
    if (user && !user.emailVerified) {
      throw verifyRequired();
    }
  }

  async create(userId: string, name: string) {
    await this.assertEmailVerified(userId);
    await this.assertCanJoinAnotherServer(userId);
    const inviteCode = await this.generateUniqueInviteCode();

    return this.prisma.$transaction(async (tx) => {
      const server = await tx.server.create({
        data: {
          name,
          ownerId: userId,
          inviteCode,
          invites: { create: { code: inviteCode, createdById: userId } },
          roles: {
            create: {
              name: '@everyone',
              isDefault: true,
              permissions:
                Permissions.VIEW_CHANNEL |
                Permissions.SEND_MESSAGES |
                Permissions.ADD_REACTIONS |
                Permissions.CHANGE_NICKNAME,
            },
          },
          channels: { create: { name: 'general', position: 0 } },
        },
      });

      const everyone = await tx.role.findFirstOrThrow({
        where: { serverId: server.id, isDefault: true },
        select: { id: true },
      });

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
    return servers.map(({ _count, ...server }) => ({
      ...server,
      memberCount: _count.members,
      channelCount: _count.channels,
    }));
  }

  async detail(serverId: string) {
    const { _count, invites, channels, categories, ...server } =
      await this.prisma.server.findUniqueOrThrow({
        where: { id: serverId },
        include: {
          categories: { orderBy: { position: 'asc' } },
          channels: { orderBy: { position: 'asc' } },
          roles: { orderBy: { position: 'asc' } },
          invites: { where: { revokedAt: null }, select: { expiresAt: true }, take: 1 },
          _count: { select: { members: true } },
        },
      });
    // Vùng mặc định (channel ngoài category, theo `position` Int) đứng TRƯỚC; kênh trong category sắp theo `positionKey`.
    const categoryOrder = new Map(categories.map((category, index) => [category.id, index]));
    const sortedChannels = [...channels].sort((a, b) => {
      if (a.categoryId === null && b.categoryId === null) return a.position - b.position;
      if (a.categoryId === null) return -1;
      if (b.categoryId === null) return 1;
      const byCategory =
        (categoryOrder.get(a.categoryId) ?? categories.length) -
        (categoryOrder.get(b.categoryId) ?? categories.length);
      if (byCategory !== 0) return byCategory;
      return compareRanks(a.positionKey ?? '', b.positionKey ?? '');
    });
    return {
      ...server,
      categories: categories.map(
        ({ serverId: _serverId, createdAt: _c, updatedAt: _u, ...category }) => category,
      ),
      channels: sortedChannels,
      memberCount: _count.members,
      inviteExpiresAt: invites[0]?.expiresAt?.toISOString() ?? null,
    };
  }

  async update(
    serverId: string,
    actorId: string,
    input: { name?: string; iconAttachmentId?: string },
  ): Promise<{ id: string; name: string; iconUrl: string | null }> {
    const current = await this.prisma.server.findUnique({
      where: { id: serverId },
      select: { name: true, iconUrl: true },
    });
    if (!current) {
      throw new NotFoundException('Server not found');
    }
    const server = await this.prisma.$transaction(async (tx) => {
      let iconUrl = current.iconUrl;
      if (input.iconAttachmentId) {
        await this.attachments.claimProfileAttachment(
          tx,
          actorId,
          input.iconAttachmentId,
          'serverIcon',
        );
        iconUrl = (await this.attachments.profileLink(input.iconAttachmentId, true)).url;
        await this.attachments.releaseProfileAttachment(tx, current.iconUrl);
      }
      const [row] = await Promise.all([
        tx.server.update({
          where: { id: serverId },
          data: { ...(input.name !== undefined ? { name: input.name } : {}), iconUrl },
          select: { id: true, name: true, iconUrl: true },
        }),
        this.audit.record({
          serverId,
          actorId,
          action: 'SERVER_UPDATE',
          targetId: serverId,
          metadata: {
            ...(input.name !== undefined && input.name !== current.name
              ? { from: current.name, to: input.name }
              : {}),
            ...(input.iconAttachmentId ? { iconChanged: true } : {}),
          },
        }),
      ]);
      return row;
    });
    this.realtime.emitToServer(serverId, ServerEvents.ServerUpdated, {
      id: server.id,
      name: server.name,
      iconUrl: server.iconUrl,
    });
    return server;
  }

  async updateMyNickname(serverId: string, userId: string, nickname: string | null) {
    const member = await this.prisma.member.findUnique({
      where: { serverId_userId: { serverId, userId } },
      select: { id: true },
    });
    if (!member) throw new NotFoundException('Member not found');
    const updated = await this.prisma.member.update({
      where: { id: member.id },
      data: { nickname },
      select: {
        id: true,
        serverId: true,
        nickname: true,
        user: { select: { id: true, displayName: true, avatarUrl: true } },
      },
    });
    this.realtime.emitToServer(serverId, ServerEvents.MemberUpdated, {
      serverId,
      memberId: updated.id,
      nickname: updated.nickname,
      user: updated.user,
    });
    return updated;
  }

  async myPermissions(serverId: string, userId: string): Promise<MyServerPermissions> {
    const { isOwner, permissions } = await this.abilityFactory.contextFor(serverId, userId);
    return { isOwner, permissions: permissions.toString() };
  }

  async members(serverId: string, { after, limit }: ListMembersQuery) {
    const rows = await this.prisma.member.findMany({
      where: { serverId, ...(after ? { id: { gt: after } } : {}) },
      include: {
        user: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
        roles: { select: { role: { select: { id: true, name: true } } } },
      },
      orderBy: { id: 'asc' },
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const online = await this.realtime.onlineUserIds(page.map((row) => row.userId));
    return { members: page.map((row) => ({ ...row, online: online.has(row.userId) })), hasMore };
  }

  async join(userId: string, inviteCode: string) {
    // Tra bảng ServerInvite để phân biệt hết hạn/thu hồi với không tồn tại; `Server.inviteCode` chỉ là bản sao hiển thị.
    const invite = await this.prisma.serverInvite.findUnique({
      where: { code: inviteCode },
      include: { server: { select: { id: true, name: true, inviteCode: true } } },
    });
    if (!invite) {
      throw new NotFoundException('Invalid invite code');
    }
    if (invite.revokedAt) {
      throw new GoneException({
        code: ErrorCodes.INVITE_REVOKED,
        message: 'This invite has been revoked',
      });
    }
    if (invite.expiresAt && invite.expiresAt.getTime() <= Date.now()) {
      throw new GoneException({
        code: ErrorCodes.INVITE_EXPIRED,
        message: 'This invite has expired',
      });
    }
    const server = invite.server;

    // Kiểm ban TRƯỚC mọi nhánh khác của join; message không kèm reason (lý do là dữ liệu của người quản lý).
    const ban = await this.prisma.serverBan.findUnique({
      where: { serverId_userId: { serverId: server.id, userId } },
      select: { id: true },
    });
    if (ban) {
      throw new ForbiddenException({
        code: ErrorCodes.BANNED,
        message: 'You are banned from this server',
      });
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
    // Cache ability phải chết ngay và socket đang mở phải rời room ngay, không đợi ngắt kết nối.
    await this.abilityFactory.invalidateMember(serverId, userId);
    await this.realtime.refreshAccess(serverId, [userId]);
  }

  async kick(serverId: string, actorId: string, memberId: string): Promise<void> {
    const member = await this.prisma.member.findUnique({
      where: { id: memberId },
      select: { id: true, serverId: true, userId: true },
    });
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
    // Xóa server là đặc quyền CHỦ SỞ HỮU (tier 2), không phải quyền role nên check ở đây thay vì @CheckAbility.
    if (server.ownerId !== userId) {
      throw new ForbiddenException('Only the owner can delete this server');
    }

    // Lấy member TRƯỚC khi cascade xóa họ để còn báo qua socket.
    const memberUserIds = (
      await this.prisma.member.findMany({ where: { serverId }, select: { userId: true } })
    ).map((member) => member.userId);

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

  async regenerate(
    serverId: string,
    actorId: string,
    input: RegenerateInviteInput,
  ): Promise<RegenerateInviteResult> {
    await this.assertEmailVerified(actorId);
    const server = await this.prisma.server.findUnique({
      where: { id: serverId },
      select: { id: true },
    });
    if (!server) {
      throw new NotFoundException('Server not found');
    }

    const expiresAt =
      input.expiresInDays !== undefined
        ? new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000)
        : null;

    return this.prisma.$transaction(async (tx) => {
      await tx.serverInvite.updateMany({
        where: { serverId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      const code = await this.generateUniqueInviteCode(tx);
      const invite = await tx.serverInvite.create({
        data: { serverId, code, createdById: actorId, expiresAt },
      });
      await tx.server.update({ where: { id: serverId }, data: { inviteCode: code } });
      await this.audit.record(
        {
          serverId,
          actorId,
          action: 'SERVER_INVITE_REGENERATE',
          targetId: invite.id,
          metadata: { expiresAt: expiresAt?.toISOString() ?? null },
        },
        tx,
      );
      return { invite: { code: invite.code, expiresAt: invite.expiresAt?.toISOString() ?? null } };
    });
  }

  private async generateUniqueInviteCode(db: Prisma.TransactionClient = this.prisma) {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const code = randomBytes(6).toString('base64url');
      const [takenByServer, takenByInvite] = await Promise.all([
        db.server.findUnique({ where: { inviteCode: code }, select: { id: true } }),
        db.serverInvite.findUnique({ where: { code }, select: { id: true } }),
      ]);
      if (!takenByServer && !takenByInvite) {
        return code;
      }
    }
    throw new InternalServerErrorException('Could not allocate a unique invite code');
  }
}
