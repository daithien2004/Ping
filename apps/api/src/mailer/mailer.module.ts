import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema.js';
import { createMailer } from './mailer.factory.js';
import { MAILER } from './mailer.js';

/**
 * Cổng Mailer toàn cục (TG.8): provider MAILER chọn theo env SMTP_URL — có URL thì
 * SmtpMailer (Mailpit ở dev, dịch vụ thật ở staging), bỏ trống thì ConsoleMailer chỉ log.
 * Global như JwtModule: module nào gửi thư cũng inject được mà không phải import lại.
 */
@Global()
@Module({
  providers: [
    {
      provide: MAILER,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) =>
        createMailer(config.get('SMTP_URL', { infer: true })),
    },
  ],
  exports: [MAILER],
})
export class MailerModule {}
