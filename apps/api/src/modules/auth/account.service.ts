import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { argon2id, hash as hashPassword, verify as verifyPassword } from 'argon2';
import { PinoLogger } from 'nestjs-pino';
import {
  ErrorCodes,
  type ChangePasswordInput,
  type SessionDto,
  type SessionsResponse,
} from '@ping/shared';
import type { Env } from '../../config/env.schema.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { MAILER, type Mailer, type MailInput } from '../../mailer/mailer.js';
import {
  mailLocaleOf,
  resetPasswordTemplate,
  verifyEmailTemplate,
} from '../../mailer/templates.js';
import { AccountRateLimitService } from './account-rate-limit.js';
import { describeUserAgent } from './describe-user-agent.js';
import {
  emailTokenUsable,
  hashEmailToken,
  newEmailToken,
  RESET_TOKEN_TTL_MS,
  VERIFY_TOKEN_TTL_MS,
} from './email-token.js';

export function verifyTokenInvalid(): BadRequestException {
  return new BadRequestException({
    code: ErrorCodes.VERIFY_TOKEN_INVALID,
    message: 'Verification token is invalid, expired or already used',
  });
}

export function verifyRequired(): ForbiddenException {
  return new ForbiddenException({
    code: ErrorCodes.VERIFY_REQUIRED,
    message: 'Verify your email before creating servers or invites',
  });
}

// Phiên hiện tại xác định bằng claim `sid` trong access JWT, KHÔNG so cookie refresh
// (cookie có path /api/v1/auth nên không tới /users/*).
@Injectable()
export class AccountService {
  private readonly logger: PinoLogger;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService<Env, true>,
    @Inject(MAILER) private readonly mailer: Mailer,
    private readonly rateLimit: AccountRateLimitService,
    logger: PinoLogger,
  ) {
    this.logger = logger;
    this.logger.setContext('AccountService');
  }

  async verifyEmail(rawToken: string): Promise<void> {
    const token = await this.prisma.emailToken.findUnique({
      where: { tokenHash: hashEmailToken(rawToken) },
    });
    if (!emailTokenUsable(token)) {
      throw verifyTokenInvalid();
    }
    await this.prisma.$transaction([
      this.prisma.emailToken.update({
        where: { id: token!.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: token!.userId },
        data: { emailVerified: true },
      }),
    ]);
  }

  async forgotPassword(email: string, ip: string): Promise<void> {
    await this.rateLimit.assertForgotAllowed(email, ip);
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (!user) {
      return;
    }
    const { raw, tokenHash } = newEmailToken();
    await this.prisma.emailToken.create({
      data: {
        userId: user.id,
        kind: 'reset',
        tokenHash,
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      },
    });
    this.deliver(user.id, email, (locale) =>
      resetPasswordTemplate(locale, `${this.webOrigin()}/reset-password?token=${raw}`),
    );
  }

  async resetPassword(rawToken: string, password: string): Promise<void> {
    const token = await this.prisma.emailToken.findUnique({
      where: { tokenHash: hashEmailToken(rawToken) },
    });
    if (!emailTokenUsable(token)) {
      throw verifyTokenInvalid();
    }
    const passwordHash = await hashPassword(password, { type: argon2id });
    await this.prisma.$transaction([
      this.prisma.emailToken.update({
        where: { id: token!.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: token!.userId },
        data: { passwordHash },
      }),
      // Reset không cần đăng nhập → xóa MỌI phiên, kể cả phiên của kẻ đánh cắp.
      this.prisma.session.deleteMany({ where: { userId: token!.userId } }),
    ]);
  }

  async resendVerification(email: string, ip: string): Promise<void> {
    await this.rateLimit.assertResendAllowed(email, ip);
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, emailVerified: true },
    });
    if (!user || user.emailVerified) {
      return;
    }
    await this.issueVerificationEmail(user.id, email);
  }

  async changePassword(
    userId: string,
    input: ChangePasswordInput,
    currentSessionId: string | undefined,
  ): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true },
    });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    const currentValid = await verifyPassword(user.passwordHash, input.currentPassword);
    if (!currentValid) {
      // 400 thay vì 401: request đã xác thực; 401 khiến client đăng xuất chỉ vì gõ sai mật khẩu hiện tại.
      throw new BadRequestException('Current password is incorrect');
    }
    const passwordHash = await hashPassword(input.password, { type: argon2id });
    // Token cũ không có claim sid (rolling deploy) → xóa mọi phiên.
    const liveSessionId = await this.liveCurrentSessionId(userId, currentSessionId);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { passwordHash } }),
      this.prisma.session.deleteMany({
        where: {
          userId,
          ...(liveSessionId ? { id: { not: liveSessionId } } : {}),
        },
      }),
    ]);
  }

  async listSessions(
    userId: string,
    currentSessionId: string | undefined,
  ): Promise<SessionsResponse> {
    const rows = await this.prisma.session.findMany({
      where: { userId, revokedAt: null },
      select: { id: true, device: true, userAgent: true, createdAt: true, lastUsedAt: true },
      orderBy: [{ lastUsedAt: 'desc' }, { createdAt: 'desc' }],
    });
    return {
      sessions: rows.map((row): SessionDto => ({
        id: row.id,
        device: row.device || describeUserAgent(row.userAgent),
        createdAt: row.createdAt.toISOString(),
        lastUsedAt: row.lastUsedAt.toISOString(),
        current: row.id === currentSessionId,
      })),
    };
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const { count } = await this.prisma.session.deleteMany({
      where: { id: sessionId, userId },
    });
    if (count === 0) {
      throw new NotFoundException('Session not found');
    }
  }

  async revokeOtherSessions(userId: string, currentSessionId: string | undefined): Promise<void> {
    const liveSessionId = await this.liveCurrentSessionId(userId, currentSessionId);
    await this.prisma.session.deleteMany({
      where: {
        userId,
        ...(liveSessionId ? { id: { not: liveSessionId } } : {}),
      },
    });
  }

  // `sid` chỉ là phiên hiện tại khi hàng Session CÒN SỐNG của đúng người gọi: JWT chưa refresh sau rotation
  // trỏ hàng revoked, loại trừ nó sẽ xóa nhầm phiên mới của chính người dùng.
  private async liveCurrentSessionId(
    userId: string,
    sid: string | undefined,
  ): Promise<string | undefined> {
    if (!sid) {
      return undefined;
    }
    const row = await this.prisma.session.findFirst({
      where: { id: sid, userId, revokedAt: null },
      select: { id: true },
    });
    return row?.id;
  }

  // Không chờ gửi thư: SMTP chậm/hỏng không được làm chậm response, lỗi chỉ log.
  async issueVerificationEmail(userId: string, email: string): Promise<void> {
    const { raw, tokenHash } = newEmailToken();
    await this.prisma.emailToken.create({
      data: {
        userId,
        kind: 'verify',
        tokenHash,
        expiresAt: new Date(Date.now() + VERIFY_TOKEN_TTL_MS),
      },
    });
    this.deliver(userId, email, (locale) =>
      verifyEmailTemplate(locale, `${this.webOrigin()}/verify?token=${raw}`),
    );
  }

  private deliver(
    userId: string,
    to: string,
    build: (locale: 'vi' | 'en') => Omit<MailInput, 'to'>,
  ): void {
    void (async () => {
      const settings = await this.prisma.userSettings.findUnique({
        where: { userId },
        select: { locale: true },
      });
      const content = build(mailLocaleOf(settings?.locale));
      await this.mailer.send({ to, ...content });
    })().catch((error: unknown) => {
      this.logger.warn({ err: error as Error, to }, 'Gửi thư vòng đời tài khoản thất bại');
    });
  }

  private webOrigin(): string {
    return this.config.getOrThrow('WEB_ORIGIN', { infer: true });
  }
}
