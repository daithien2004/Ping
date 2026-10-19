import { ForbiddenException, Injectable } from '@nestjs/common';
import { defineAbilityFor, type AbilityContext, type AppAbility } from '@ping/shared';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { RedisProvider } from '../../infra/redis/redis.module.js';

interface CachedContext {
  isOwner: boolean;
  permissions: string; // bigint không serialize được JSON — lưu string
}

/**
 * Nơi DUY NHẤT build ability trong API (guide 10.2): nạp member kèm các role
 * của user trong server, OR permissions các role lại, rồi gọi `defineAbilityFor`
 * từ shared. Guard, service và Gateway (Bước 9+) đều đi qua factory này —
 * không rải logic kiểm tra quyền ở nhiều chỗ.
 */
@Injectable()
export class AbilityFactory {
  /** Cache ngắn hạn: quyền chỉ đổi khi role đổi hoặc member bị gỡ role. */
  private readonly ttlSeconds = 30;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisProvider,
  ) {}

  async createForUser(serverId: string, userId: string): Promise<AppAbility> {
    return defineAbilityFor(await this.contextFor(serverId, userId));
  }

  /** Role đổi quyền hoặc gán/tháo role hàng loạt → cache cũ đang "nói dối": xóa ngay cả server. */
  async invalidateServer(serverId: string): Promise<void> {
    // SCAN theo từng lô thay vì KEYS: KEYS quét toàn bộ Redis trong một lệnh và chặn
    // mọi client khác (rate limit, pub/sub) cho tới khi xong.
    const stream = this.redis.scanStream({ match: `ability:${serverId}:*`, count: 200 });
    for await (const keys of stream as AsyncIterable<string[]>) {
      if (keys.length > 0) {
        await this.redis.del(keys);
      }
    }
  }

  async invalidateMember(serverId: string, userId: string): Promise<void> {
    await this.redis.del(AbilityFactory.cacheKey(serverId, userId));
  }

  private static cacheKey(serverId: string, userId: string): string {
    return `ability:${serverId}:${userId}`;
  }

  /** Quyền hiệu lực của user trong server; ném 403 nếu không phải member. */
  async contextFor(serverId: string, userId: string): Promise<AbilityContext> {
    const key = AbilityFactory.cacheKey(serverId, userId);
    const cached = await this.redis.get(key);
    if (cached) {
      const parsed = JSON.parse(cached) as CachedContext;
      return { userId, isOwner: parsed.isOwner, permissions: BigInt(parsed.permissions) };
    }

    const member = await this.prisma.member.findUnique({
      where: { serverId_userId: { serverId, userId } },
      include: {
        // @everyone luôn tính vào quyền, kể cả khi dòng MemberRole của nó bị thiếu.
        server: {
          select: {
            ownerId: true,
            roles: { where: { isDefault: true }, select: { permissions: true } },
          },
        },
        roles: { select: { role: { select: { permissions: true } } } },
      },
    });
    if (!member) {
      // Chặn sớm ngay ở tầng guard: không phải member thì không có ability nào cả.
      throw new ForbiddenException('You are not a member of this server');
    }

    // Quyền hiệu lực = OR permissions của @everyone và mọi role member có.
    const permissions = [
      ...member.server.roles,
      ...member.roles.map((memberRole) => memberRole.role),
    ].reduce((acc, role) => acc | role.permissions, 0n);
    const context: AbilityContext = {
      userId,
      isOwner: member.server.ownerId === userId,
      permissions,
    };
    const serialized: CachedContext = {
      isOwner: context.isOwner,
      permissions: permissions.toString(),
    };
    await this.redis.set(key, JSON.stringify(serialized), 'EX', this.ttlSeconds);
    return context;
  }
}
