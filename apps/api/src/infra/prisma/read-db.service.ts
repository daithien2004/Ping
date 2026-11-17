import { Injectable, Logger, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import type { Env } from '../../config/env.schema.js';
import { PrismaClient } from '../../generated/prisma/client.js';
import { MetricsService } from '../metrics/metrics.service.js';
import { PrismaService } from './prisma.service.js';

const CHECK_MS = 3_000;

/**
 * Định tuyến đọc sang replica (ADR-0102). Chỉ dùng cho truy vấn chấp nhận được dữ liệu cũ vài trăm mili giây (tìm kiếm,
 * trang tin nhắn cũ phía sau con trỏ); mọi ghi và mọi đọc cần "đọc-sau-ghi" vẫn đi primary. Không cấu hình
 * REPLICA_DATABASE_URL thì `client` là primary. Replica chết hoặc chậm quá ngưỡng thì tự rơi về primary.
 */
@Injectable()
export class ReadDbService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(ReadDbService.name);
  private readonly replica: PrismaClient | undefined;
  private readonly maxLagBytes: number;
  private healthy = false;
  private timer: NodeJS.Timeout | undefined;

  constructor(
    config: ConfigService<Env, true>,
    private readonly primary: PrismaService,
    private readonly metrics: MetricsService,
  ) {
    const url = config.get('REPLICA_DATABASE_URL', { infer: true });
    this.maxLagBytes = config.get('REPLICA_MAX_LAG_BYTES', { infer: true });
    if (url) {
      this.replica = new PrismaClient({
        adapter: new PrismaPg({
          connectionString: url,
          max: config.getOrThrow('PG_POOL_MAX', { infer: true }),
          connectionTimeoutMillis: 2_000,
          statement_timeout: config.getOrThrow('PG_QUERY_TIMEOUT_MS', { infer: true }),
          query_timeout: config.getOrThrow('PG_QUERY_TIMEOUT_MS', { infer: true }),
        }),
      });
      metrics.registerDependency('postgres_replica', async () => this.healthy);
    }
  }

  /** Client để đọc dữ liệu chấp nhận trễ; mỗi lần gọi tính một lượt đọc vào metric theo đích. */
  get client(): PrismaClient {
    const target = this.replica && this.healthy ? 'replica' : 'primary';
    this.metrics.dbReadOnce(target);
    return target === 'replica' ? this.replica! : this.primary;
  }

  get usingReplica(): boolean {
    return Boolean(this.replica && this.healthy);
  }

  async onModuleInit(): Promise<void> {
    if (!this.replica) return;
    await this.check();
    this.timer = setInterval(() => void this.check(), CHECK_MS);
    this.timer.unref();
  }

  async onApplicationShutdown(): Promise<void> {
    clearInterval(this.timer);
    await this.replica?.$disconnect();
  }

  /**
   * Lành khi: là replica, đang nhận WAL, và phần WAL đã nhận nhưng chưa áp dụng dưới ngưỡng. Không dùng
   * `now() - pg_last_xact_replay_timestamp()` vì khi primary không có ghi nào, mốc đó cũ dần dù replica đã đuổi kịp.
   */
  private async check(): Promise<void> {
    try {
      const [row] = await this.replica!.$queryRaw<
        { in_recovery: boolean; receiving: boolean; backlog: number | null }[]
      >`SELECT pg_is_in_recovery() AS in_recovery,
               EXISTS (SELECT 1 FROM pg_stat_wal_receiver) AS receiving,
               pg_wal_lsn_diff(pg_last_wal_receive_lsn(), pg_last_wal_replay_lsn())::float8 AS backlog`;
      const next =
        Boolean(row?.in_recovery) &&
        Boolean(row?.receiving) &&
        (row?.backlog ?? 0) <= this.maxLagBytes;
      if (next !== this.healthy) {
        this.logger.warn({ healthy: next, backlog: row?.backlog }, 'replica đổi trạng thái');
      }
      this.healthy = next;
    } catch (error) {
      if (this.healthy)
        this.logger.warn({ err: (error as Error).message }, 'replica không truy vấn được');
      this.healthy = false;
    }
  }
}
