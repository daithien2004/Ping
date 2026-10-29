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
import { verifyRequired } from '../auth/account.service.js';
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
    private readonly attachments: AttachmentsService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  /** Trần mềm số server mỗi user tham gia (tính cả server tự tạo). */
  private async assertCanJoinAnotherServer(userId: string): Promise<void> {
    if ((await this.prisma.member.count({ where: { userId } })) >= Limits.MAX_SERVERS_PER_USER) {
      throw limitReached('servers', Limits.MAX_SERVERS_PER_USER);
    }
  }

  /**
   * Chính sách tài khoản chưa xác minh (TG.8): chưa xác minh email thì không được tạo
   * server và không được cấp mã mời. Đặt ở tầng SERVICE chứ không phải defineAbilityFor:
   * đây là điều kiện hồ sơ tài khoản (trạng thái xác minh), không phải luật quyền theo
   * role — ability vẫn trả "owner được tạo server" cho user chưa xác minh.
   *
   * CHỈ áp dụng khi hệ thống có đường gửi thư (`SMTP_URL` cấu hình — Mailer SMTP): môi
   * trường không có mailer (drill, smoke prod example, dev tối giản) thì user KHÔNG THỂ
   * tự xác minh — chặn là khóa vĩnh viễn vô lý. Đã đỏ CI ở 2662d94 (drills + smoke đăng
   * ký user rồi tạo server ngay).
   */
  private async assertEmailVerified(userId: string): Promise<void> {
    if (!this.config.get('SMTP_URL', { infer: true })) return;
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { emailVerified: true },
    });
    // User vừa bị xóa giữa chừng thì tra cứu trật — xử lý như trường hợp không xác minh.
    if (user && !user.emailVerified) {
      throw verifyRequired();
    }
  }

  async create(userId: string, name: string) {
    await this.assertEmailVerified(userId);
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
          // T3.6: mã mời là bản ghi ServerInvite đang hoạt động (join tra bảng này).
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
    const { _count, invites, ...server } = await this.prisma.server.findUniqueOrThrow({
      where: { id: serverId },
      include: {
        channels: { orderBy: { position: 'asc' } },
        roles: { orderBy: { position: 'asc' } },
        // Mã đang hoạt động là bản ghi chưa thu hồi duy nhất (regenerate thu hồi hết
        // rồi tạo mới, create tạo đúng một) — chỉ lấy hạn dùng để UI hiển thị.
        invites: { where: { revokedAt: null }, select: { expiresAt: true }, take: 1 },
        _count: { select: { members: true } },
      },
    });
    return {
      ...server,
      memberCount: _count.members,
      inviteExpiresAt: invites[0]?.expiresAt?.toISOString() ?? null,
    };
  }

  /**
   * Đổi tên/icon server (T3.1, TG.7). Guard đã xác nhận `update Server`; ở đây đọc giá trị cũ
   * để audit có before/after, rồi cập nhật và ghi audit trong cùng một transaction. Icon gắn
   * bằng attachment `scope=serverIcon` đã ready; icon cũ chuyển `deleting` cho worker dọn.
   */
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

  /**
   * TG.7: tự đặt biệt danh của chính mình. Guard đã xác nhận `update Member`
   * (bit CHANGE_NICKNAME); endpoint `/members/me` chỉ chạm đúng member của caller.
   */
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
    // T3.6: join tra mã mời ở bảng ServerInvite để phân biệt rõ hết hạn/thu hồi
    // (mã lỗi riêng) với mã không tồn tại. `Server.inviteCode` chỉ là bản sao hiển thị.
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

    // TG.11: người bị ban không vào lại được bằng mã mời — chặn trước mọi nhánh khác của
    // join. Kiểm theo (serverId, userId) trên bảng ServerBan (unique index, một lần tra).
    // Message không kèm reason: lý do ban là dữ liệu của người quản lý (xem qua danh sách
    // ban / audit log), người bị ban chỉ cần biết mình bị cấm.
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
   * Tạo mã mời mới (T3.6): thu hồi mọi mã đang hoạt động, cấp mã mới (hạn dùng tùy
   * chọn), đồng bộ bản sao `Server.inviteCode` và ghi audit — tất cả trong một
   * transaction nên không có khoảnh khắc server "không có mã".
   * Guard đã xác nhận `update Server` trước khi vào đây.
   */
  async regenerate(
    serverId: string,
    actorId: string,
    input: RegenerateInviteInput,
  ): Promise<RegenerateInviteResult> {
    // Cấp mã mời cũng thuộc chính sách chưa xác minh (TG.8): chủ server chưa xác minh
    // email không được phát mã kéo người mới vào.
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

  /**
   * 6 byte ngẫu nhiên → 8 ký tự base64url (~48 bit): đủ ngắn để share, đủ rộng
   * để không đoán được. Vẫn kiểm tra trùng vì unique constraint là chốt chặn cuối.
   * Chấp nhận client của transaction đang chạy để gọi được trong `regenerate`.
   */
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
