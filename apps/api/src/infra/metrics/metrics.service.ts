import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { NextFunction, Request, Response } from 'express';
import { createServer, type Server } from 'node:http';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import type { Env } from '../../config/env.schema.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisProvider } from '../redis/redis.module.js';
import { access, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

// Tập hữu hạn: nhãn Prometheus không được nổ cardinality.
export type AiRequestOutcome =
  | 'cancelled'
  | 'ok'
  | 'cache_hit'
  | 'invalid_question'
  | 'quota_exceeded'
  | 'budget_exhausted'
  | 'retrieval_failed'
  | 'insufficient_context'
  | 'no_citation'
  | 'unavailable';

// Registry riêng mỗi instance Nest (không dùng toàn cục) để hai app trong một process test không giẫm nhau.
// Phục vụ ở cổng riêng, không bao giờ trên cổng công khai.
@Injectable()
export class MetricsService implements OnModuleDestroy {
  private readonly registry = new Registry();
  readonly attachmentJobs = new Counter({
    name: 'attachment_jobs_total',
    help: 'Attachment processing outcomes',
    labelNames: ['outcome'],
    registers: [this.registry],
  });
  private readonly httpDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'Thời gian xử lý request HTTP',
    // route = MẪU đường dẫn, không phải URL thật: nhãn không được nổ số lượng.
    labelNames: ['method', 'route', 'status_class'],
    registers: [this.registry],
  });
  private readonly wsConnections = new Gauge({
    name: 'ws_connections',
    help: 'Số socket đang mở trên instance này',
    registers: [this.registry],
  });
  private readonly wsDisconnects = new Counter({
    name: 'ws_disconnects_total',
    help: 'Số lần socket ngắt kết nối',
    registers: [this.registry],
  });
  private server: Server | undefined;
  readonly outboxPending = new Gauge({
    name: 'outbox_pending',
    help: 'So event outbox chua phat',
    registers: [this.registry],
  });
  readonly outboxLagSeconds = new Gauge({
    name: 'outbox_lag_seconds',
    help: 'Do tre cua event outbox cu nhat (giay)',
    registers: [this.registry],
  });
  readonly outboxDead = new Gauge({
    name: 'outbox_dead',
    help: 'So event outbox chua phat da vuot so lan thu toi da',
    registers: [this.registry],
  });
  readonly consumerLag = new Gauge({
    name: 'consumer_lag',
    help: 'So event stream chua duoc consumer xu ly xong',
    registers: [this.registry],
  });
  readonly aiRequests = new Counter({
    name: 'ai_requests_total',
    help: 'So luot hoi AI theo ket qua',
    labelNames: ['outcome'],
    registers: [this.registry],
  });
  readonly aiTokens = new Counter({
    name: 'ai_tokens_total',
    help: 'So token LLM da dung',
    labelNames: ['kind'],
    registers: [this.registry],
  });
  readonly aiCost = new Counter({
    name: 'ai_cost_usd_total',
    help: 'Chi phi LLM uoc tinh (USD)',
    registers: [this.registry],
  });
  readonly aiLlmDuration = new Histogram({
    name: 'ai_llm_duration_seconds',
    help: 'Thoi gian mot loi goi LLM (giay)',
    registers: [this.registry],
  });

  readonly aiLatency = new Histogram({
    name: 'ai_latency_seconds',
    help: 'Ask stream lifetime, including retrieval/cache and client consumption (seconds)',
    labelNames: ['outcome'],
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 2.5, 5, 10, 20, 30, 60],
    registers: [this.registry],
  });
  readonly qdrantLatency = new Histogram({
    name: 'qdrant_latency_seconds',
    help: 'Qdrant HTTP request duration through response headers (seconds)',
    labelNames: ['outcome'],
    registers: [this.registry],
  });
  readonly searchLatency = new Histogram({
    name: 'search_latency_seconds',
    help: 'Full-text search service duration including failed queries (seconds)',
    labelNames: ['outcome'],
    registers: [this.registry],
  });

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisProvider,
    config: ConfigService<Env, true>,
  ) {
    collectDefaultMetrics({ register: this.registry });
    const budgetUsd = config.get('AI_DAILY_BUDGET_USD', { infer: true });
    const budget = new Gauge({
      name: 'ai_daily_budget_usd',
      help: 'Configured daily AI budget, USD (0 disables the budget limit)',
      registers: [this.registry],
    });
    budget.set(budgetUsd);
    // Cả hai gauge await cùng một lần đọc DB để mô tả cùng một lượt scrape.
    let pending: Promise<number | undefined> | undefined;
    const snapshot = (): Promise<number | undefined> => {
      pending ??= (async () => {
        const day = new Date();
        day.setUTCHours(0, 0, 0, 0);
        try {
          const result = await this.prisma.aiUsage.aggregate({
            _sum: { costUsd: true },
            where: { day },
          });
          return Number(result._sum.costUsd ?? 0);
        } catch {
          return undefined;
        } finally {
          pending = undefined;
        }
      })();
      return pending;
    };
    const budgetUp = new Gauge({
      name: 'ai_budget_metrics_up',
      help: '1 if daily AI spending was read successfully from Postgres at scrape time',
      registers: [this.registry],
      collect: async () => {
        budgetUp.set((await snapshot()) === undefined ? 0 : 1);
      },
    });
    const spending = new Gauge({
      name: 'ai_daily_spent_usd',
      help: 'System-wide AI spending for the current UTC day from Postgres; do not sum replicas',
      registers: [this.registry],
      collect: async () => {
        spending.set((await snapshot()) ?? Number.NaN);
      },
    });
    const dependency = new Gauge({
      name: 'dependency_up',
      help: '1 nếu Postgres/Redis trả lời được, 0 nếu không (đo lúc scrape)',
      labelNames: ['name'],
      registers: [this.registry],
      collect: async () => {
        dependency.set({ name: 'postgres' }, (await this.postgresUp()) ? 1 : 0);
        dependency.set({ name: 'redis' }, (await this.redisUp()) ? 1 : 0);
        try {
          const root = resolve(config.get('ATTACHMENT_STORAGE_DIR', { infer: true }));
          await mkdir(root, { recursive: true });
          await access(root, 6);
          dependency.set({ name: 'attachment_storage' }, 1);
        } catch {
          dependency.set({ name: 'attachment_storage' }, 0);
        }
      },
    });
  }

  readonly middleware = (req: Request, res: Response, next: NextFunction): void => {
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      const route = req.route?.path ? `${req.baseUrl}${req.route.path}` : 'unmatched';
      this.httpDuration.observe(
        { method: req.method, route, status_class: `${Math.floor(res.statusCode / 100)}xx` },
        Number(process.hrtime.bigint() - started) / 1e9,
      );
    });
    next();
  };

  socketOpened(): void {
    this.wsConnections.inc();
  }

  socketClosed(): void {
    this.wsConnections.dec();
    this.wsDisconnects.inc();
  }

  aiRequestFinished(outcome: AiRequestOutcome, seconds: number): void {
    this.aiRequests.inc({ outcome });
    this.aiLatency.observe({ outcome }, seconds);
  }

  aiLlmCompleted(
    seconds: number,
    usage?: { promptTokens: number; completionTokens: number },
    costUsd = 0,
  ): void {
    this.aiLlmDuration.observe(seconds);
    if (usage) {
      this.aiTokens.inc({ kind: 'prompt' }, usage.promptTokens);
      this.aiTokens.inc({ kind: 'completion' }, usage.completionTokens);
    }
    if (costUsd > 0) this.aiCost.inc(costUsd);
  }

  qdrantCompleted(seconds: number, outcome: 'ok' | 'error'): void {
    this.qdrantLatency.observe({ outcome }, seconds);
  }

  searchCompleted(seconds: number, outcome: 'ok' | 'error'): void {
    this.searchLatency.observe({ outcome }, seconds);
  }

  async listen(port: number): Promise<number> {
    this.server = createServer((req, res) => {
      if (req.method !== 'GET' || req.url !== '/metrics') {
        res.writeHead(404).end();
        return;
      }
      this.registry.metrics().then(
        (body) => res.writeHead(200, { 'Content-Type': this.registry.contentType }).end(body),
        () => res.writeHead(500).end(),
      );
    });
    await new Promise<void>((resolve) => this.server!.listen(port, resolve));
    const address = this.server.address();
    return typeof address === 'object' && address !== null ? address.port : port;
  }

  async onModuleDestroy(): Promise<void> {
    const server = this.server;
    if (!server) return;
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  private async postgresUp(): Promise<boolean> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return true;
    } catch {
      return false;
    }
  }

  private async redisUp(): Promise<boolean> {
    if (!this.redis.isUp) return false;
    try {
      await this.redis.ping();
      return true;
    } catch {
      return false;
    }
  }
}
