import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import type { Env } from '../../config/env.schema.js';
import { ACCESS_TOKEN_TTL } from './auth.constants.js';
import { AccountController } from './account.controller.js';
import { AccountRateLimitService } from './account-rate-limit.js';
import { AccountService } from './account.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { LoginAttemptsService } from './login-attempts.service.js';

@Module({
  imports: [
    // Global: mọi module (và sau này Socket.IO gateway) inject JwtService
    // hoặc AuthService được mà không cần import lại module này.
    JwtModule.registerAsync({
      global: true,
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        secret: config.getOrThrow('JWT_ACCESS_SECRET', { infer: true }),
        signOptions: { expiresIn: ACCESS_TOKEN_TTL },
      }),
    }),
  ],
  controllers: [AuthController, AccountController],
  providers: [AuthService, LoginAttemptsService, AccountService, AccountRateLimitService],
  exports: [AuthService, LoginAttemptsService, AccountService],
})
export class AuthModule {}
