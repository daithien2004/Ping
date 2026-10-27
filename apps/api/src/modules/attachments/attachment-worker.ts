import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../../config/env.schema.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { MetricsService } from '../../infra/metrics/metrics.service.js';
import { Storage } from './local-storage.js';
import { InvalidFile, validateFile } from './file-validation.js';

@Injectable()
export class AttachmentWorker implements OnModuleInit, OnModuleDestroy {
  private timer?: ReturnType<typeof setTimeout>;
  private stopped = false;
  private pending?: Promise<void>;
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: Storage,
    private readonly config: ConfigService<Env, true>,
    private readonly metrics: MetricsService,
  ) {}
  onModuleInit() {
    if (
      this.config.get('NODE_ENV', { infer: true }) === 'test' ||
      process.env.PING_PROCESS_ROLE !== 'worker'
    )
      return;
    const tick = () => {
      this.pending = this.runOnce()
        .then(() => undefined)
        .catch(() => {
          this.metrics.attachmentJobs.inc({ outcome: 'retry' });
        })
        .finally(() => {
          if (!this.stopped) this.timer = setTimeout(tick, 1000);
        });
    };
    tick();
  }
  async onModuleDestroy() {
    this.stopped = true;
    clearTimeout(this.timer);
    await this.pending;
  }

  /** PostgreSQL row lock is the lease: a crash rolls back for another worker. */
  async runOnce() {
    let claimed: string | undefined;
    try {
      await this.prisma.$transaction(
        async (tx) => {
          // TG.7: điều kiện dọn theo scope — tin bị xóa/kênh mất chỉ áp dụng cho tệp tin nhắn;
          // serverIcon dọn khi server mất, avatar dọn khi uploader không còn; pending quá 1 giờ
          // chưa gắn (mọi scope) đều là mồ côi.
          const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM "Attachment" a WHERE "nextRetryAt" <= NOW() AND (
          status IN ('queued', 'deleting') OR (status IN ('ready', 'rejected') AND NOT "rawRemoved") OR
          (status NOT IN ('deleted', 'rejected') AND (
            ("messageId" IS NULL AND "createdAt" < NOW() - INTERVAL '1 hour') OR
            (scope = 'message' AND (
              EXISTS (SELECT 1 FROM "Message" m WHERE m.id = a."messageId" AND m."deletedAt" IS NOT NULL) OR
              NOT EXISTS (SELECT 1 FROM "Channel" c WHERE c.id = a."channelId")
            )) OR
            (scope = 'serverIcon' AND NOT EXISTS (SELECT 1 FROM "Server" s WHERE s.id = a."serverId")) OR
            (scope = 'avatar' AND NOT EXISTS (SELECT 1 FROM "User" u WHERE u.id = a."uploaderId"))
          )))
        ORDER BY "createdAt" LIMIT 1 FOR UPDATE SKIP LOCKED`;
          if (!rows[0]) return;
          claimed = rows[0].id;
          const row = await tx.attachment.findUniqueOrThrow({
            where: { id: rows[0].id },
            include: { message: { select: { deletedAt: true } } },
          });
          const channel =
            row.scope === 'message'
              ? await tx.channel.findUnique({
                  where: { id: row.channelId! },
                  select: { id: true },
                })
              : null;
          const expired = !row.messageId && row.createdAt.getTime() < Date.now() - 3_600_000;
          if (row.status === 'rejected') {
            for (const suffix of ['raw', 'ready', 'thumb'])
              await this.storage.remove(`${row.id}.${suffix}`);
            await tx.attachment.update({
              where: { id: row.id },
              data: { rawRemoved: true, quotaBytes: 0 },
            });
            return;
          }
          const messageGone =
            row.scope === 'message' && (Boolean(row.message?.deletedAt) || !channel || expired);
          const profileGone =
            row.scope === 'avatar'
              ? !(await tx.user.findUnique({ where: { id: row.uploaderId }, select: { id: true } }))
              : row.scope === 'serverIcon'
                ? !(await tx.server.findUnique({
                    where: { id: row.serverId! },
                    select: { id: true },
                  }))
                : false;
          if (row.status === 'deleting' || messageGone || profileGone) {
            for (const suffix of ['raw', 'ready', 'thumb'])
              await this.storage.remove(`${row.id}.${suffix}`);
            await tx.attachment.update({ where: { id: row.id }, data: { status: 'deleted' } });
            this.metrics.attachmentJobs.inc({ outcome: 'deleted' });
            return;
          }
          if (row.status === 'ready') {
            await this.storage.remove(`${row.id}.raw`);
            await tx.attachment.update({
              where: { id: row.id },
              data: { rawRemoved: true, quotaBytes: row.quotaBytes - row.sizeBytes },
            });
            return;
          }
          try {
            const result = await validateFile(await this.storage.read(`${row.id}.raw`), {
              // Avatar/icon chỉ nhận ảnh tĩnh; tệp tin nhắn giữ nguyên bộ lọc bảo thủ (ADR-0053).
              kinds: row.scope === 'message' ? ['image', 'pdf'] : ['image'],
            });
            await this.storage.write(`${row.id}.ready`, result.bytes);
            if (result.thumbnail) await this.storage.write(`${row.id}.thumb`, result.thumbnail);
            await tx.attachment.update({
              where: { id: row.id },
              data: {
                status: 'ready',
                quotaBytes: row.sizeBytes + result.bytes.length + (result.thumbnail?.length ?? 0),
                mime: result.mime,
                width: result.width,
                height: result.height,
              },
            });
            this.metrics.attachmentJobs.inc({ outcome: 'ready' });
          } catch (error) {
            if (!(error instanceof InvalidFile)) throw error;
            await tx.attachment.update({ where: { id: row.id }, data: { status: 'rejected' } });
            this.metrics.attachmentJobs.inc({ outcome: 'rejected' });
          }
        },
        { timeout: 20_000 },
      );
    } catch (error) {
      if (claimed)
        await this.prisma.attachment.updateMany({
          where: { id: claimed },
          data: { nextRetryAt: new Date(Date.now() + 30_000) },
        });
      throw error;
    }
  }
}
