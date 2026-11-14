import { type OnApplicationShutdown, Injectable, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import type { Env } from '../../config/env.schema.js';
import { PrismaClient } from '../../generated/prisma/client.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnApplicationShutdown {
  constructor(config: ConfigService<Env, true>) {
    super({
      adapter: new PrismaPg({
        connectionString: config.getOrThrow('DATABASE_URL', { infer: true }),
        max: config.getOrThrow('PG_POOL_MAX', { infer: true }),
        connectionTimeoutMillis: 5_000,
        statement_timeout: config.getOrThrow('PG_QUERY_TIMEOUT_MS', { infer: true }),
        query_timeout: config.getOrThrow('PG_QUERY_TIMEOUT_MS', { infer: true }),
      }),
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  // Đóng sau khi HTTP/Socket.IO đã đóng: request đang chạy vẫn còn DB.
  async onApplicationShutdown(): Promise<void> {
    await this.$disconnect();
  }
}
