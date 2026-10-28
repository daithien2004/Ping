import { Injectable, NotFoundException } from '@nestjs/common';
import {
  type NotificationPrefDto,
  type NotificationPrefsResponse,
  type SetNotificationPrefInput,
} from '@ping/shared';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

/**
 * Prefs thông báo (TG.12): mức all/mentions/none + mute có hạn của người gọi trên một
 * server hoặc một channel. Server CHỈ lưu và đọc lại — badge/notification do CLIENT tính
 * (hàm thuần `shouldNotify` trong @ping/shared); client fetch một lần khi boot, không có
 * event/realtime ở đây.
 *
 * Dữ liệu user-scoped: mọi truy vấn khóa theo `userId` lấy từ JWT, không bao giờ từ path —
 * người khác không đọc/sửa/xóa được prefs của nhau (phủ IDOR ở test/notification-prefs.e2e-spec.ts).
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** GET /users/me/notification-prefs — mọi dòng prefs của người gọi (người chưa cấu hình gì → rỗng). */
  async list(userId: string): Promise<NotificationPrefsResponse> {
    const rows = await this.prisma.notificationPref.findMany({
      where: { userId },
      orderBy: { createdAt: 'asc' },
    });
    return { prefs: rows.map((row) => this.toDto(row)) };
  }

  /**
   * PUT /users/me/notification-prefs/server/:serverId — upsert theo unique
   * (userId, scope, targetId): đặt lại cùng target không nhân dòng, trả 200 với dòng hiện tại.
   * Kiểm target tồn tại (404 khi server đã xóa/không có) nhưng KHÔNG kiểm quyền member:
   * prefs là dữ liệu của người gọi, đặt mức cho server mình không thuộc chỉ tạo một hàng
   * prefs vô hại của CHÍNH họ — không đụng dữ liệu server, không lộ gì cho người khác.
   */
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

  /** PUT /users/me/notification-prefs/channel/:channelId — như server, target là channel
   * (kể cả channel DM: prefs là cài đặt của người gọi, không phải quyền trên channel). */
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

  /** DELETE /users/me/notification-prefs/server/:serverId — reset về mặc định; idempotent 204
   * (deleteMany: gỡ target chưa từng cấu hình vẫn thành công, không cần kiểm tồn tại). */
  async deleteServerPref(userId: string, serverId: string): Promise<void> {
    await this.prisma.notificationPref.deleteMany({
      where: { userId, scope: 'server', targetId: serverId },
    });
  }

  /** DELETE /users/me/notification-prefs/channel/:channelId — như server, idempotent 204. */
  async deleteChannelPref(userId: string, channelId: string): Promise<void> {
    await this.prisma.notificationPref.deleteMany({
      where: { userId, scope: 'channel', targetId: channelId },
    });
  }

  /** Upsert theo unique ba cột (schema.prisma @@unique([userId, scope, targetId])). */
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
        // mutedUntil là ISO datetime (zod bắt offset) — Date.parse trước khi lưu.
        mutedUntil: input.mutedUntil === null ? null : new Date(input.mutedUntil),
      },
      update: {
        level: input.level,
        mutedUntil: input.mutedUntil === null ? null : new Date(input.mutedUntil),
      },
    });
    return this.toDto(row);
  }

  /** Row (cột `scope`/`level` là String do API kiểm giá trị) → DTO của hợp đồng shared. */
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
