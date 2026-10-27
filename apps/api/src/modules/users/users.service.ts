import { Injectable, NotFoundException } from '@nestjs/common';
import type { UpdateProfileInput } from '@ping/shared';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { AttachmentsService } from '../attachments/attachments.service.js';
import { RealtimeService } from '../realtime/realtime.service.js';
import { ServerEvents } from '@ping/shared';

/**
 * Hồ sơ cá nhân (TG.7): đổi tên hiển thị và avatar. Avatar gắn bằng attachment
 * `scope=avatar` đã `ready` qua pipeline TG.6; một tệp chỉ gắn một lần và tệp cũ
 * bị thay thế sẽ chuyển `deleting` để worker dọn.
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
}
