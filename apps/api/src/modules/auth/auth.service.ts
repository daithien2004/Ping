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

/** Chỉ các trường an toàn với client — passwordHash không bao giờ leave service này. */
const userPublicSelect = {
  id: true,
  email: true,
  username: true,
  displayName: true,
  avatarUrl: true,
  createdAt: true,
  // TG.8: web dùng cờ này để nhắc xác minh email (chính sách chặn tạo server/mã mời).
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

/**
 * SHA-256 là đủ cho refresh token: nó là chuỗi ngẫu nhiên 384-bit nên không
 * brute-force được (khác mật khẩu người dùng thấp entropy — mới cần argon2id),
 * và hash cố định giúp lookup theo duy nhất một hàng trong Session.
 */
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
          // Username không phân biệt hoa/thường: 'Alice' và 'alice' là một tài khoản.
          username: normalizedUsername,
          displayName: input.displayName ?? input.username,
          passwordHash,
          // TG.8: user mới luôn chưa xác minh — thư verify gửi ngay dưới đây. RIÊNG e2e
          // (NODE_ENV=test): ~25 spec cũ đăng ký user rồi tạo server ngay, coi fixture như
          // đã xác minh (cùng pattern attachment-worker/indexer tự tắt khi test); chính sách
          // chưa xác minh vẫn luôn chạy và được test riêng trong account-lifecycle.e2e-spec
          // bằng cách đặt lại cờ qua Prisma.
          emailVerified: this.config.get('NODE_ENV', { infer: true }) === 'test',
        },
        select: userPublicSelect,
      });
    } catch (error) {
      // Hai request đăng ký trùng nhau có thể lọt qua check findFirst ở trên —
      // unique constraint mới là chốt chặn thật sự.
      if (isUniqueConstraintError(error)) {
        throw new ConflictException('Email or username already taken');
      }
      throw error;
    }

    // Gửi thư xác minh fire-and-forget (TG.8): tạo token + gửi SMTP chạy nền, lỗi chỉ
    // log — đăng ký không được chặn hay thất bại vì SMTP chậm/hỏng.
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

    // Email không tồn tại vẫn phải chạy một lần argon2.verify với hash giả,
    // để thời gian trả lời không tiết lộ email có trong DB hay không (timing equalization).
    const passwordValid = found
      ? await verifyPassword(found.passwordHash, input.password)
      : await this.burnVerify(input.password);

    if (!found || !passwordValid) {
      await this.loginAttempts.recordFailure(input.email, ip);
      // Một message duy nhất cho mọi kiểu sai — không phân biệt "sai mật khẩu" hay "không có user".
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
    // Dọn session đã hết hạn của user mỗi lần đăng nhập — bảng Session không phình mãi
    // mà không cần job định kỳ. Session revoke nhưng chưa hết hạn được GIỮ lại để
    // còn phát hiện token bị đánh cắp dùng lại.
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

    // Token đã bị xoay vòng (revokedAt có giá trị) mà vẫn xuất hiện = bị đánh cắp.
    // Không biết kẻ giữ token cũ hay session mới — an toàn nhất là kill cả hai:
    // revoke MỌI session còn sống của user, chủ thật sẽ đăng nhập lại từ đầu.
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

    // Rotation: session cũ đóng lại, token mới mở session mới. Điều kiện revokedAt: null
    // làm việc đóng là nguyên tử: hai refresh đồng thời thì chỉ một bên thắng. lastUsedAt
    // (TG.8) cập nhật ở đây — thời điểm session được dùng gần nhất.
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
    // Idempotent: token rác hoặc đã revoked cũng trả 204 — logout không bao giờ fail.
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
      // Token còn sống nhưng user đã bị xóa giữa chừng.
      throw new NotFoundException('User not found');
    }
    return user;
  }

  /** Dùng chung cho REST guard và (sau này) Socket.IO handshake. */
  async verifyAccessToken(token: string): Promise<AuthenticatedUser> {
    // sid (TG.8): id hàng Session phát hành token — dùng đánh dấu "phiên hiện tại" trong
    // danh sách phiên và thu hồi "mọi phiên khác". Claim cũ (triển khai cuốn chiếu) thiếu
    // sid → sessionId undefined, các endpoint phiên rơi về nhánh an toàn (xóa mọi phiên).
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
        // TG.8: tóm tắt thiết bị tính MỘT lúc tạo để danh sách phiên không phải parse UA.
        device: describeUserAgent(ctx.userAgent),
      },
      select: { id: true },
    });

    // sid = hàng Session vừa tạo: JWT mang theo "phiên hiện tại" đã ký (lý do ở AccountService).
    const accessToken = await this.jwt.signAsync({
      sub: userId,
      username,
      sid: session.id,
    });
    return { accessToken, refreshCookie: { token: rawRefreshToken, expiresAt } };
  }

  private dummyHashPromise?: Promise<string>;

  /** Argon2id hash giả — tốn cùng thời gian với verify thật để cân bằng timing. */
  private burnVerify(password: string): Promise<boolean> {
    this.dummyHashPromise ??= hashPassword(randomBytes(16), { type: argon2id });
    return this.dummyHashPromise.then((dummyHash) => verifyPassword(dummyHash, password));
  }
}
