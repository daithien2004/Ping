import { ForbiddenException, Injectable, Logger } from '@nestjs/common';
import { defineAbilityFor, type AbilityContext, type AppAbility } from '@ping/shared';
import { PrismaService } from '../../infra/prisma/prisma.service.js';
import { RedisProvider } from '../../infra/redis/redis.module.js';
import { failOpen } from '../../infra/redis/redis-policy.js';

interface CachedContext {
  isOwner: boolean;
  permissions: string; // bigint không serialize được JSON — lưu string
}

@Injectable()
export class AbilityFactory {
  private readonly ttlSeconds = 30;
  private readonly logger = new Logger(AbilityFactory.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisProvider,
  ) {}

  async createForUser(serverId: string, userId: string): Promise<AppAbility> {
    return defineAbilityFor(await this.contextFor(serverId, userId));
  }

  // Bỏ qua cache: cổng an toàn (RAG) không được nhận quyền cũ tới 30 giây.
  async createForUserFresh(serverId: string, userId: string): Promise<AppAbility> {
    return defineAbilityFor(await this.contextForFresh(serverId, userId));
  }

  async contextForFresh(serverId: string, userId: string): Promise<AbilityContext> {
    return this.loadContext(serverId, userId);
  }

  async invalidateServer(serverId: string): Promise<void> {
    // SCAN theo lô, không KEYS: KEYS chặn mọi client Redis khác.
    // Redis chết: bỏ qua, quyền sai sống tối đa ttlSeconds.
    await failOpen(
      this.redis,
      this.logger,
      'ability-invalidate',
      async () => {
        const stream = this.redis.scanStream({ match: `ability:${serverId}:*`, count: 200 });
        for await (const keys of stream as AsyncIterable<string[]>) {
          if (keys.length > 0) {
            await this.redis.del(keys);
          }
        }
      },
      undefined,
    );
  }

  async invalidateMember(serverId: string, userId: string): Promise<void> {
    await failOpen(
      this.redis,
      this.logger,
      'ability-invalidate',
      () => this.redis.del(AbilityFactory.cacheKey(serverId, userId)),
      0,
    );
  }

  private static cacheKey(serverId: string, userId: string): string {
    return `ability:${serverId}:${userId}`;
  }

  async contextFor(serverId: string, userId: string): Promise<AbilityContext> {
    const key = AbilityFactory.cacheKey(serverId, userId);
    // Cache hỏng = trượt cache, tính lại từ Postgres.
    const cached = await failOpen(
      this.redis,
      this.logger,
      'ability-cache',
      () => this.redis.get(key),
      null,
    );
    if (cached) {
      const parsed = JSON.parse(cached) as CachedContext;
      return { userId, isOwner: parsed.isOwner, permissions: BigInt(parsed.permissions) };
    }

    const context = await this.loadContext(serverId, userId);
    await this.cacheContext(serverId, userId, context);
    return context;
  }

  private async loadContext(serverId: string, userId: string): Promise<AbilityContext> {
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
      throw new ForbiddenException('You are not a member of this server');
    }

    const permissions = [
      ...member.server.roles,
      ...member.roles.map((memberRole) => memberRole.role),
    ].reduce((acc, role) => acc | role.permissions, 0n);
    return {
      userId,
      isOwner: member.server.ownerId === userId,
      permissions,
    };
  }

  private async cacheContext(
    serverId: string,
    userId: string,
    context: AbilityContext,
  ): Promise<void> {
    const serialized: CachedContext = {
      isOwner: context.isOwner,
      permissions: context.permissions.toString(),
    };
    await failOpen(
      this.redis,
      this.logger,
      'ability-cache',
      () =>
        this.redis.set(
          AbilityFactory.cacheKey(serverId, userId),
          JSON.stringify(serialized),
          'EX',
          this.ttlSeconds,
        ),
      null,
    );
  }
}
