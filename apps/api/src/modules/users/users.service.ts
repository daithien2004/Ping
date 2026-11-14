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

    this.realtime.emitToUser(userId, ServerEvents.UserUpdated, updated);
    const memberships = await this.prisma.member.findMany({
      where: { userId },
      select: { serverId: true },
    });
    for (const { serverId } of memberships)
      this.realtime.emitToServer(serverId, ServerEvents.UserUpdated, updated);
    return updated;
  }

  // Không phát UserUpdated: đây là cài đặt riêng tư, payload event công khai không được mang cột này.
  async updatePrivacy(userId: string, input: UpdatePrivacyInput) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { dmAllow: input.dmAllow },
      select: { id: true, dmAllow: true },
    });
  }

  async getPrivacy(userId: string): Promise<UserPrivacyDto> {
    const row = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { dmAllow: true },
    });
    if (!row) throw new NotFoundException('User not found');
    return { dmAllow: row.dmAllow as UserPrivacyDto['dmAllow'] };
  }

  // Lazy default: GET không tạo hàng; PATCH là nơi duy nhất ghi.
  async getSettings(userId: string): Promise<UserSettingsDto> {
    const row = await this.prisma.userSettings.findUnique({ where: { userId } });
    return row ? this.toSettingsDto(row) : { ...USER_SETTINGS_DEFAULTS };
  }

  // Prisma 7 không nhận undefined trong data: spread có điều kiện.
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
