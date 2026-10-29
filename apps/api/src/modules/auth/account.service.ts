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

/** Mã DUY NHẤT cho token sai/hết hạn/đã dùng — không tiết lộ token từng tồn tại (TG.8). */
export function verifyTokenInvalid(): BadRequestException {
  return new BadRequestException({
    code: ErrorCodes.VERIFY_TOKEN_INVALID,
    message: 'Verification token is invalid, expired or already used',
  });
}

/** Chính sách chưa xác minh: chặn tạo server/mã mời (TG.8). */
export function verifyRequired(): ForbiddenException {
  return new ForbiddenException({
    code: ErrorCodes.VERIFY_REQUIRED,
    message: 'Verify your email before creating servers or invites',
  });
}

/**
 * Vòng đời tài khoản (TG.8): xác minh email, quên/đặt lại mật khẩu, đổi mật khẩu,
 * danh sách + thu hồi phiên. Token một lần lưu BĂM (email-token.ts); phản hồi chống
 * dò tài khoản (forgot/resend luôn cùng một hình dạng dù email có tồn tại hay không).
 *
 * Quyết định tích hợp với refresh hiện có: /auth/refresh KHÔNG phải JWT stateless —
 * đã là opaque refresh token có hàng Session trong DB (rotation + phát hiện tái sử
 * dụng, xem AuthService.refresh). TG.8 chỉ mở rộng hàng Session: `device` (tóm tắt
 * User-Agent lúc tạo) và `lastUsedAt` (cập nhật mỗi lần refresh thành công); cơ chế
 * xoay vòng giữ nguyên. "Phiên hiện tại" trong danh sách/thu hồi xác định bằng claim
 * `sid` trong access JWT (do issueTokens gắn) — KHÔNG so cookie refresh, vì cookie có
 * path `/api/v1/auth` nên trình duyệt không gửi kèm tới /users/*; `sid` nằm trong JWT
 * đã ký nên client không tự nhận phiên khác là "hiện tại" được.
 */
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

  /** POST /auth/verify-email — token hợp lệ → xác minh (idempotent) và đánh dấu đã dùng → 204. */
  async verifyEmail(rawToken: string): Promise<void> {
    const token = await this.prisma.emailToken.findUnique({
      where: { tokenHash: hashEmailToken(rawToken) },
    });
    if (!emailTokenUsable(token)) {
      throw verifyTokenInvalid();
    }
    // Idempotent: user đã verified trước đó vẫn 204, token vẫn bị tiêu một lần.
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

  /**
   * POST /auth/password/forgot — LUÔN trả cùng một kết quả (controller 202 body cố định),
   * dù email có tồn tại: không dò được tài khoản. Email tồn tại thì tạo token reset
   * (TTL 30 phút, lưu băm) và gửi thư fire-and-forget.
   */
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

  /** POST /auth/password/reset — đặt mật khẩu mới, tiêu token, thu hồi MỌI phiên → 204. */
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
      // Người gọi không cần đăng nhập để đặt lại mật khẩu → xóa sạch phiên, kể cả phiên
      // của kẻ đánh cắp phiên đang mở. (Hàng Session không còn → refresh cũ 401.)
      this.prisma.session.deleteMany({ where: { userId: token!.userId } }),
    ]);
  }

  /** POST /auth/verify-email/resend — luôn 202; chỉ gửi thư khi user tồn tại và chưa xác minh. */
  async resendVerification(email: string, ip: string): Promise<void> {
    await this.rateLimit.assertResendAllowed(email, ip);
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true, emailVerified: true },
    });
    // Đã xác minh rồi thì không gửi nữa — hộp thư đã được chứng minh thuộc về người dùng.
    if (!user || user.emailVerified) {
      return;
    }
    await this.issueVerificationEmail(user.id, email);
  }

  /**
   * PATCH /users/me/password — kiểm mật khẩu hiện tại rồi đổi; các phiên KHÁC phiên
   * hiện tại bị thu hồi (TG.8). Access JWT của phiên hiện tại còn hiệu lực nên người
   * dùng không bị văng ra; phiên khác phải đăng nhập lại.
   */
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
      // 400 thay vì 401: request ĐÃ xác thực bằng JWT hợp lệ; 401 khiến client tưởng
      // token chết và đăng xuất người dùng chỉ vì gõ sai mật khẩu hiện tại.
      throw new BadRequestException('Current password is incorrect');
    }
    const passwordHash = await hashPassword(input.password, { type: argon2id });
    // Token cũ không có claim sid (triển khai cuốn chiếu) → xóa mọi phiên: an toàn hơn
    // là giữ nhầm phiên lạ, người dùng hiện tại đăng nhập lại là xong.
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

  /** GET /users/me/sessions — các phiên còn sống, mới dùng trước; `current` theo claim sid. */
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
        // Hàng cũ trước TG.8 không có tóm tắt — suy lại từ userAgent đã lưu.
        device: row.device || describeUserAgent(row.userAgent),
        createdAt: row.createdAt.toISOString(),
        lastUsedAt: row.lastUsedAt.toISOString(),
        current: row.id === currentSessionId,
      })),
    };
  }

  /** DELETE /users/me/sessions/:sessionId — 404 khi không tồn tại hoặc không phải của mình. */
  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const { count } = await this.prisma.session.deleteMany({
      where: { id: sessionId, userId },
    });
    if (count === 0) {
      throw new NotFoundException('Session not found');
    }
  }

  /** DELETE /users/me/sessions — thu hồi mọi phiên KHÁC phiên hiện tại (đăng xuất nơi khác). */
  async revokeOtherSessions(userId: string, currentSessionId: string | undefined): Promise<void> {
    const liveSessionId = await this.liveCurrentSessionId(userId, currentSessionId);
    await this.prisma.session.deleteMany({
      where: {
        userId,
        ...(liveSessionId ? { id: { not: liveSessionId } } : {}),
      },
    });
  }

  /**
   * Claim `sid` chỉ được làm "phiên hiện tại" khi hàng Session tương ứng CÒN SỐNG của
   * đúng người gọi. JWT chưa refresh sau khi rotation trỏ tới hàng đã revoked — nếu
   * vẫn loại trừ nó thì phiên sống MỚI của chính người dùng (tạo bởi lần refresh) lại
   * bị "thu hồi phiên khác" xóa nhầm.
   */
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

  /**
   * Tạo token xác minh (TTL 24h, lưu băm) và gửi thư — KHÔNG chờ việc gửi: SMTP chậm/hỏng
   * không được làm chậm response, lỗi chỉ log. register() gọi fire-and-forget (`void`),
   * resendVerification gọi hàm này và hưởng luôn phần ghi DB đã đợi.
   */
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

  /** Gửi thư fire-and-forget: ngôn ngữ theo cài đặt người dùng (TG.13), mặc định tiếng Việt. */
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
      // Không kèm body thư (chứa token) vào log — chỉ người nhận và lý do (quy tắc 11).
      this.logger.warn({ err: error as Error, to }, 'Gửi thư vòng đời tài khoản thất bại');
    });
  }

  private webOrigin(): string {
    return this.config.getOrThrow('WEB_ORIGIN', { infer: true });
  }
}
