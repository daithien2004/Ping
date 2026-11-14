import {
  ConflictException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { argon2id, hash as hashPassword, verify as verifyPassword } from 'argon2';
import { createHash, randomBytes } from 'node:crypto';
import { PinoLogger } from 'nestjs-pino';
import type { LoginInput, RegisterInput } from '@ping/shared';
import type { Env } from '../../config/env.schema.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { isUniqueConstraintError } from '../../common/utils/prisma-errors.js';
import { AccountService } from './account.service.js';
import { describeUserAgent } from './describe-user-agent.js';
import { REFRESH_REUSE_GRACE_MS, REFRESH_TOKEN_TTL_MS } from './auth.constants.js';
import type { AuthenticatedUser } from './current-user.decorator.js';
import { LoginAttemptsService } from './login-attempts.service.js';

const userPublicSelect = {
  id: true,
  email: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  createdAt: true,
  emailVerified: true,
} as const;

export interface AuthRequestContext {
  ip?: string;
  userAgent?: string;
}

export interface RefreshCookieValue {
  token: string;
  expiresAt: Date;
}

interface IssuedTokens {
  accessToken: string;
  refreshCookie: RefreshCookieValue;
}

// SHA-256 đủ cho refresh token (ngẫu nhiên 384-bit, không brute-force được); hash cố định để lookup một hàng.
function hashToken(rawToken: string): string {
  return createHash('sha256').update(rawToken).digest('hex');
}

@Injectable()
export class AuthService {
  private readonly logger: PinoLogger;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
    private readonly loginAttempts: LoginAttemptsService,
    private readonly account: AccountService,
    logger: PinoLogger,
  ) {
    this.logger = logger;
    this.logger.setContext('AuthService');
  }

  async register(input: RegisterInput, ctx: AuthRequestContext) {
    const normalizedUsername = input.username.toLowerCase();
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email: input.email }, { username: normalizedUsername }] },
      select: { id: true },
    });
    if (existing) {
      throw new ConflictException('Email or username already taken');
    }

    const passwordHash = await hashPassword(input.password, { type: argon2id });
    let user;
    try {
      user = await this.prisma.user.create({
        data: {
          email: input.email,
          username: normalizedUsername,
          displayName: input.displayName ?? input.username,
          passwordHash,
          // Riêng NODE_ENV=test: coi user mới đã xác minh (fixture e2e); chính sách chưa xác minh được test riêng
          // trong account-lifecycle.e2e-spec.
          emailVerified: this.config.get('NODE_ENV', { infer: true }) === 'test',
        },
        select: userPublicSelect,
      });
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('Email or username already taken');
      }
      throw error;
    }

    void this.account.issueVerificationEmail(user.id, user.email).catch((error: unknown) => {
      this.logger.warn({ err: error as Error }, 'Không gửi được thư xác minh sau đăng ký');
    });

    const tokens = await this.issueTokens(user.id, user.username, ctx);
    return { user, ...tokens };
  }

  async login(input: LoginInput, ctx: AuthRequestContext) {
    const ip = ctx.ip ?? 'unknown';
    await this.loginAttempts.assertAllowed(input.email, ip);
    const found = await this.prisma.user.findUnique({
      where: { email: input.email },
      select: { ...userPublicSelect, passwordHash: true },
    });

    // Email không tồn tại vẫn chạy argon2.verify với hash giả để cân bằng timing.
    const passwordValid = found
      ? await verifyPassword(found.passwordHash, input.password)
      : await this.burnVerify(input.password);

    if (!found || !passwordValid) {
      await this.loginAttempts.recordFailure(input.email, ip);
      throw new UnauthorizedException('Invalid email or password');
    }

    await this.loginAttempts.reset(input.email, ip);
    const publicUser = {
      id: found.id,
      email: found.email,
      username: found.username,
      displayName: found.displayName,
      avatarUrl: found.avatarUrl,
      createdAt: found.createdAt,
      emailVerified: found.emailVerified,
    };
    // Session revoke nhưng chưa hết hạn được GIỮ để phát hiện token bị đánh cắp dùng lại.
    await this.prisma.session.deleteMany({
      where: { userId: found.id, expiresAt: { lt: new Date() } },
    });
    const tokens = await this.issueTokens(found.id, found.username, ctx);
    return { user: publicUser, ...tokens };
  }

  async refresh(rawToken: string | undefined, ctx: AuthRequestContext) {
    if (!rawToken) {
      throw new UnauthorizedException('Missing refresh token');
    }
    const session = await this.prisma.session.findUnique({
      where: { refreshTokenHash: hashToken(rawToken) },
      include: { user: { select: { username: true } } },
    });

    if (!session) {
      throw new UnauthorizedException('Invalid refresh token');
    }

    // Token đã xoay vòng mà vẫn xuất hiện = bị đánh cắp: revoke MỌI session còn sống.
    if (session.revokedAt) {
      if (Date.now() - session.revokedAt.getTime() < REFRESH_REUSE_GRACE_MS) {
        throw new UnauthorizedException('Refresh token already rotated');
      }
      const revoked = await this.prisma.session.updateMany({
        where: { userId: session.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      this.logger.warn(
        { userId: session.userId, revokedSessions: revoked.count },
        'refresh token reuse detected — all sessions revoked',
      );
      throw new UnauthorizedException('Invalid refresh token');
    }

    if (session.expiresAt.getTime() < Date.now()) {
      throw new UnauthorizedException('Refresh token expired');
    }

    // Điều kiện revokedAt: null làm việc đóng là nguyên tử: hai refresh đồng thời chỉ một bên thắng.
    const { count } = await this.prisma.session.updateMany({
      where: { id: session.id, revokedAt: null },
      data: { revokedAt: new Date(), lastUsedAt: new Date() },
    });
    if (count === 0) {
      throw new UnauthorizedException('Refresh token already rotated');
    }
    return this.issueTokens(session.userId, session.user.username, ctx);
  }

  async logout(rawToken: string | undefined): Promise<void> {
    if (!rawToken) {
      return;
    }
    await this.prisma.session.updateMany({
      where: { refreshTokenHash: hashToken(rawToken), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: userPublicSelect,
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async verifyAccessToken(token: string): Promise<AuthenticatedUser> {
    const payload = await this.jwt.verifyAsync<{ sub: string; username: string; sid?: string }>(
      token,
    );
    return { userId: payload.sub, username: payload.username, sessionId: payload.sid };
  }

  private async issueTokens(
    userId: string,
    username: string,
    ctx: AuthRequestContext,
  ): Promise<IssuedTokens> {
    const rawRefreshToken = randomBytes(48).toString('base64url');
    const expiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_MS);

    const session = await this.prisma.session.create({
      data: {
        userId,
        refreshTokenHash: hashToken(rawRefreshToken),
        userAgent: ctx.userAgent,
        ip: ctx.ip,
        expiresAt,
        device: describeUserAgent(ctx.userAgent),
      },
      select: { id: true },
    });

    const accessToken = await this.jwt.signAsync({
      sub: userId,
      username,
      sid: session.id,
    });
    return { accessToken, refreshCookie: { token: rawRefreshToken, expiresAt } };
  }

  private dummyHashPromise?: Promise<string>;

  private burnVerify(password: string): Promise<boolean> {
    this.dummyHashPromise ??= hashPassword(randomBytes(16), { type: argon2id });
    return this.dummyHashPromise.then((dummyHash) => verifyPassword(dummyHash, password));
  }
}
