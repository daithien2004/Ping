import { Injectable, NotFoundException } from '@nestjs/common';
import {
  USER_SETTINGS_DEFAULTS,
  ServerEvents,
  type UpdatePrivacyInput,
  type UpdateProfileInput,
  type UpdateUserSettingsInput,
  type UserPrivacyDto,
  type UserSettingsDto,
} from '@ping/shared';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AttachmentsService } from '../attachments/attachments.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';

/**
 * Hồ sơ cá nhân (TG.7): đổi tên hiển thị và avatar. Avatar gắn bằng attachment
 * `scope=avatar` đã `ready` qua pipeline TG.6; một tệp chỉ gắn một lần và tệp cũ
 * bị thay thế sẽ chuyển `deleting` để worker dọn. TG.13 thêm cài đặt người dùng
 * (GET/PATCH /users/me/settings) — cùng nhánh `me` của người gọi, cùng module.
 */
@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly attachments: AttachmentsService,
    private readonly realtime: RealtimeService,
  ) {}

  async updateProfile(userId: string, input: UpdateProfileInput) {
    const updated = await this.prisma.$transaction(async (tx) => {
      const current = await tx.user.findUnique({
        where: { id: userId },
        select: { displayName: true, avatarUrl: true },
      });
      if (!current) throw new NotFoundException('User not found');
      let avatarUrl = current.avatarUrl;
      if (input.avatarAttachmentId) {
        await this.attachments.claimProfileAttachment(
          tx,
          userId,
          input.avatarAttachmentId,
          'avatar',
        );
        const link = await this.attachments.profileLink(input.avatarAttachmentId, true);
        avatarUrl = link.url;
        // Avatar cũ (nếu có) không còn được tham chiếu: worker dọn tệp và giải phóng hạn mức.
        await this.attachments.releaseProfileAttachment(tx, current.avatarUrl);
      }
      return tx.user.update({
        where: { id: userId },
        data: {
          ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
          avatarUrl,
        },
        select: { id: true, username: true, displayName: true, avatarUrl: true, createdAt: true },
      });
    });

    // Mọi server user thuộc về (và chính các tab của họ) nhận hồ sơ mới ngay (TG.7).
    this.realtime.emitToUser(userId, ServerEvents.UserUpdated, updated);
    const memberships = await this.prisma.member.findMany({
      where: { userId },
      select: { serverId: true },
    });
    for (const { serverId } of memberships)
      this.realtime.emitToServer(serverId, ServerEvents.UserUpdated, updated);
    return updated;
  }

  /**
   * TG.9 (ADR-0070): mức nhận DM của chính mình ('server_members' | 'none'). Không phát
   * UserUpdated: đây là cài đặt RIÊNG TƯ, không phải hồ sơ công khai — payload event hiện có
   * (id/username/displayName/avatarUrl) cũng không mang cột này, phát đi là lộ cài đặt.
   */
  async updatePrivacy(userId: string, input: UpdatePrivacyInput) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { dmAllow: input.dmAllow },
      select: { id: true, dmAllow: true },
    });
  }

  /** GET /users/me/privacy (TG.13): mức `dmAllow` đã lưu của chính người gọi. */
  async getPrivacy(userId: string): Promise<UserPrivacyDto> {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { dmAllow: true },
    });
    if (!row) throw new NotFoundException('User not found');
    return { dmAllow: row.dmAllow as UserPrivacyDto['dmAllow'] };
  }

  /**
   * GET /users/me/settings (TG.13) — lazy default: chưa có hàng trả DTO mặc định ở tầng
   * service mà KHÔNG tạo hàng. PATCH là nơi duy nhất ghi hàng; trả mặc định khi GET tránh
   * rác hàng cho user không bao giờ đụng settings, và xóa tài khoản không để lại gì dọn.
   */
  async getSettings(userId: string): Promise<UserSettingsDto> {
    const row = await this.prisma.userSettings.findUnique({ where: { userId } });
    return row ? this.toSettingsDto(row) : { ...USER_SETTINGS_DEFAULTS };
  }

  /**
   * PATCH /users/me/settings (TG.13) — upsert: create điền MẶC ĐỊNH cho trường không gửi,
   * update chỉ mang trường được gửi nên trường không gửi giữ nguyên giá trị cũ (PATCH
   * semantics; Prisma 7 không nhận `undefined` trong data — spread có điều kiện). Trường lạ
   * và body rỗng đã bị updateUserSettingsSchema chặn ở pipe → 400 VALIDATION_ERROR.
   */
  async updateSettings(userId: string, input: UpdateUserSettingsInput): Promise<UserSettingsDto> {
    const row = await this.prisma.userSettings.upsert({
      where: { userId },
      create: {
        userId,
        theme: input.theme ?? USER_SETTINGS_DEFAULTS.theme,
        density: input.density ?? USER_SETTINGS_DEFAULTS.density,
        fontSize: input.fontSize ?? USER_SETTINGS_DEFAULTS.fontSize,
        locale: input.locale ?? USER_SETTINGS_DEFAULTS.locale,
      },
      update: {
        ...(input.theme !== undefined ? { theme: input.theme } : {}),
        ...(input.density !== undefined ? { density: input.density } : {}),
        ...(input.fontSize !== undefined ? { fontSize: input.fontSize } : {}),
        ...(input.locale !== undefined ? { locale: input.locale } : {}),
      },
    });
    return this.toSettingsDto(row);
  }

  /** Row (cột String, giá trị do API kiểm) → DTO của hợp đồng shared (TG.13). */
  private toSettingsDto(row: {
    theme: string;
    density: string;
    fontSize: string;
    locale: string;
  }): UserSettingsDto {
    return {
      theme: row.theme as UserSettingsDto['theme'],
      density: row.density as UserSettingsDto['density'],
      fontSize: row.fontSize as UserSettingsDto['fontSize'],
      locale: row.locale as UserSettingsDto['locale'],
    };
  }
}
