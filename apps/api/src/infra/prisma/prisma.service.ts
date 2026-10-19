import { type BeforeApplicationShutdown, Injectable, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import type { Env } from '../../config/env.schema.js';
import { PrismaClient } from '../../generated/prisma/client.js';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, BeforeApplicationShutdown {
  constructor(config: ConfigService<Env, true>) {
    // Prisma 7 bắt buộc driver adapter: kết nối do thư viện `pg` đảm nhận,
    // không còn query engine Rust đọc DATABASE_URL phía sau nữa.
    super({
      adapter: new PrismaPg({
        connectionString: config.getOrThrow('DATABASE_URL', { infer: true }),
      }),
    });
  }

  async onModuleInit(): Promise<void> {
    // Docker chưa lên → crash ngay lúc boot thay vì lỗi giữa chừng (fail-fast).
    await this.$connect();
  }

  async beforeApplicationShutdown(): Promise<void> {
    await this.$disconnect();
  }
}
