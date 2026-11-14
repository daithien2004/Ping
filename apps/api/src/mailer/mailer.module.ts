import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema.js';
import { createMailer } from './mailer.factory.js';
import { MAILER } from './mailer.js';

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
