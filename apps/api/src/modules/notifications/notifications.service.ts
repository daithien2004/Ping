import { Injectable, NotFoundException } from '@nestjs/common';
import {
  type NotificationPrefDto,
  type NotificationPrefsResponse,
  type SetNotificationPrefInput,
} from '@ping/shared';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

// Server chỉ lưu/đọc prefs, badge do client tính. Mọi truy vấn khóa theo userId từ JWT, không từ path (IDOR).
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(userId: string): Promise<NotificationPrefsResponse> {
    const rows = await this.prisma.notificationPref.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    return { prefs: rows.map((row) => this.toDto(row)) };
  }

  // Kiểm target tồn tại (404) nhưng KHÔNG kiểm quyền member: prefs là dữ liệu của chính người gọi, vô hại.
  async setServerPref(
    userId: string,
    serverId: string,
    input: SetNotificationPrefInput,
  ): Promise<NotificationPrefDto> {
    const server = await this.prisma.server.findUnique({
      where: { id: serverId },
      select: { id: true },
    });
    if (!server) throw new NotFoundException('Server not found');
    return this.upsert(userId, 'server', serverId, input);
  }

  async setChannelPref(
    userId: string,
    channelId: string,
    input: SetNotificationPrefInput,
  ): Promise<NotificationPrefDto> {
    const channel = await this.prisma.channel.findUnique({
      where: { id: channelId },
      select: { id: true },
    });
    if (!channel) throw new NotFoundException('Channel not found');
    return this.upsert(userId, 'channel', channelId, input);
  }

  // deleteMany: gỡ target chưa cấu hình vẫn thành công.
  async deleteServerPref(userId: string, serverId: string): Promise<void> {
    await this.prisma.notificationPref.deleteMany({
      where: { userId, scope: 'server', targetId: serverId },
    });
  }

  async deleteChannelPref(userId: string, channelId: string): Promise<void> {
    await this.prisma.notificationPref.deleteMany({
      where: { userId, scope: 'channel', targetId: channelId },
    });
  }

  private async upsert(
    userId: string,
    scope: NotificationPrefDto['scope'],
    targetId: string,
    input: SetNotificationPrefInput,
  ): Promise<NotificationPrefDto> {
    const row = await this.prisma.notificationPref.upsert({
      where: { userId_scope_targetId: { userId, scope, targetId } },
      create: {
        userId,
        scope,
        targetId,
        level: input.level,
        mutedUntil: input.mutedUntil === null ? null : new Date(input.mutedUntil),
      },
      update: {
        level: input.level,
        mutedUntil: input.mutedUntil === null ? null : new Date(input.mutedUntil),
      },
    });
    return this.toDto(row);
  }

  private toDto(row: {
    scope: string;
    targetId: string;
    level: string;
    mutedUntil: Date | null;
  }): NotificationPrefDto {
    return {
      scope: row.scope as NotificationPrefDto['scope'],
      targetId: row.targetId,
      level: row.level as NotificationPrefDto['level'],
      mutedUntil: row.mutedUntil ? row.mutedUntil.toISOString() : null,
    };
  }
}
