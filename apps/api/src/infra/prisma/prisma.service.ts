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
        // Chờ lấy kết nối từ pool / thiết lập kết nối tối đa 5s, rồi báo lỗi (→ 503) thay vì treo.
        connectionTimeoutMillis: 5_000,
        // statement_timeout: Postgres tự hủy câu lệnh; query_timeout: client bỏ chờ nếu mạng
        // treo mà server không kịp báo. Hai giá trị bằng nhau, cái nào tới trước thì thắng.
        statement_timeout: config.getOrThrow('PG_QUERY_TIMEOUT_MS', { infer: true }),
        query_timeout: config.getOrThrow('PG_QUERY_TIMEOUT_MS', { infer: true }),
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
