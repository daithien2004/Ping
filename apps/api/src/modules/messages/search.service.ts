import { BadRequestException, Injectable } from '@nestjs/common';
import {
  ErrorCodes,
  Limits,
  type SearchResultItem,
  type SearchResultPage,
  type SearchQuery,
} from '@ping/shared';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infra/prisma/prisma.service.js';

interface SearchRow {
  id: string;
  content: string;
  channelId: string;
  channelName: string;
  createdAt: Date;
  authorId: string;
  author: { id: string; username: string; displayName: string; avatarUrl: string | null };
}

/**
 * Tìm kiếm tin nhắn trong một server (T4.6, ADR-0045): FTS `simple` + unaccent (cột sinh
 * `Message.search`, index GIN) OR con-chuỗi trigram (index GIN trên `f_unaccent(content)`).
 * WHERE luôn ràng buộc `channel.serverId` + `deletedAt IS NULL` — không lộ server khác,
 * không trả tin đã xóa. Mới nhất trước, cursor `before` theo id.
 */
@Injectable()
export class SearchService {
  constructor(private readonly prisma: PrismaService) {}

  async search(serverId: string, query: SearchQuery): Promise<SearchResultPage> {
    const q = query.q?.trim() ?? '';
    if (q.length === 0 || q.length > Limits.SEARCH_QUERY_MAX) {
      throw new BadRequestException({
        code: ErrorCodes.SEARCH_QUERY_INVALID,
        message: `Query must be 1-${Limits.SEARCH_QUERY_MAX} characters`,
      });
    }

    const rows = await this.prisma.$queryRaw<SearchRow[]>(Prisma.sql`
      SELECT
        m.id::text AS "id",
        m.content,
        m."channelId"::text AS "channelId",
        c.name AS "channelName",
        m."createdAt",
        m."authorId"::text AS "authorId",
        json_build_object(
          'id', u.id::text, 'username', u.username,
          'displayName', u."displayName", 'avatarUrl', u."avatarUrl"
        ) AS "author"
      FROM "Message" m
      JOIN "Channel" c ON c.id = m."channelId"
      JOIN "User" u ON u.id = m."authorId"
      WHERE c."serverId" = ${serverId}::uuid
        AND m."deletedAt" IS NULL
        AND (
          m.search @@ websearch_to_tsquery('simple', public.f_unaccent(${q}))
          OR public.f_unaccent(m.content) ILIKE ('%' || public.f_unaccent(${q}) || '%')
        )
        AND (${query.channelId ?? null}::uuid IS NULL OR m."channelId" = ${query.channelId ?? null}::uuid)
        AND (${query.authorId ?? null}::uuid IS NULL OR m."authorId" = ${query.authorId ?? null}::uuid)
        AND (${query.since ?? null}::timestamptz IS NULL OR m."createdAt" >= ${query.since ?? null}::timestamptz)
        AND (${query.before ?? null}::uuid IS NULL OR m.id < ${query.before ?? null}::uuid)
      ORDER BY m.id DESC
      LIMIT ${query.limit + 1}
    `);

    const hasMore = rows.length > query.limit;
    const results: SearchResultItem[] = (hasMore ? rows.slice(0, query.limit) : rows).map(
      (row) => ({
        id: row.id,
        content: row.content,
        channelId: row.channelId,
        channelName: row.channelName,
        createdAt: row.createdAt.toISOString(),
        authorId: row.authorId,
        author: row.author,
      }),
    );
    return { results, hasMore };
  }
}
