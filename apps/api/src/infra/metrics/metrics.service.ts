import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { createServer, type Server } from 'node:http';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisProvider } from '../redis/redis.module.js';

/**
 * Metrics Prometheus (ADR-0031). Registry riêng của từng instance Nest (không dùng registry toàn cục
 * của prom-client) để hai app trong cùng một process test không giẫm lên nhau. Phục vụ ở CỔNG RIÊNG
 * (`listen`), không bao giờ trên cổng công khai: số liệu nội bộ không nên ra internet.
 */
@Injectable()
export class MetricsService implements OnModuleDestroy {
  private readonly registry = new Registry();
  private readonly httpDuration = new Histogram({
    name: 'http_request_duration_seconds',
    help: 'Thời gian xử lý request HTTP',
    // route = MẪU đường dẫn (/servers/:serverId), không phải URL thật: nhãn không được nổ số lượng.
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

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisProvider,
  ) {
    collectDefaultMetrics({ register: this.registry });
    const dependency = new Gauge({
      name: 'dependency_up',
      help: '1 nếu Postgres/Redis trả lời được, 0 nếu không (đo lúc scrape)',
      labelNames: ['name'],
      registers: [this.registry],
      collect: async () => {
        dependency.set({ name: 'postgres' }, (await this.postgresUp()) ? 1 : 0);
        dependency.set({ name: 'redis' }, (await this.redisUp()) ? 1 : 0);
      },
    });
  }

  /** Middleware Express: đo mỗi request khi response kết thúc, kể cả 4xx/5xx và route không khớp. */
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

  /** Mở cổng metrics (`GET /metrics`). Trả về cổng thật (0 = hệ điều hành chọn, dùng cho test). */
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
      await this.prisma.$queryRaw`SELECT 1`; // query_timeout (ADR-0026) cắt nếu treo
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
