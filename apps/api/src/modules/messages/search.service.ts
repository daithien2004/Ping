import { BadRequestException, Injectable } from '@nestjs/common';
import {
  ErrorCodes,
  Limits,
  type SearchResultItem,
  type SearchResultPage,
  type SearchQuery,
} from '@ping/shared';
import { Prisma } from '../../generated/prisma/client.js';
import { MetricsService } from '../../infra/metrics/metrics.service.js';
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

const SEARCH_PROBE_CAP = 1000;

// WHERE luôn ràng buộc `channel.serverId` + `deletedAt IS NULL`: không lộ server khác, không trả tin đã xóa.
@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly metrics: MetricsService,
  ) {}

  async search(serverId: string, query: SearchQuery): Promise<SearchResultPage> {
    const started = performance.now();
    let outcome: 'ok' | 'error' = 'error';
    try {
      const result = await this.searchResults(serverId, query);
      outcome = 'ok';
      return result;
    } finally {
      this.metrics.searchCompleted((performance.now() - started) / 1_000, outcome);
    }
  }

  private async searchResults(serverId: string, query: SearchQuery): Promise<SearchResultPage> {
    const q = query.q?.trim() ?? '';
    if (q.length === 0 || q.length > Limits.SEARCH_QUERY_MAX) {
      throw new BadRequestException({
        code: ErrorCodes.SEARCH_QUERY_INVALID,
        message: `Query must be 1-${Limits.SEARCH_QUERY_MAX} characters`,
      });
    }

    const matches = Prisma.sql`(
          m.search @@ websearch_to_tsquery('simple', public.f_unaccent(${q}))
          OR public.f_unaccent(m.content) ILIKE ('%' || public.f_unaccent(${q}) || '%')
        )`;
    // ADR-0095: với từ hiếm, `ORDER BY id LIMIT` khiến planner quét ngược pkey và lọc cả bảng (75-112 s ở 10 triệu tin).
    // Thăm dò có trần: ít khớp thì lấy hàng khớp qua index trước rồi mới sắp xếp.
    const [probe] = await this.prisma.$queryRaw<{ n: number }[]>(Prisma.sql`
      SELECT count(*)::int AS n FROM (
        SELECT 1 FROM "Message" m WHERE m."deletedAt" IS NULL AND ${matches} LIMIT ${SEARCH_PROBE_CAP}
      ) probe
    `);
    const rare = (probe?.n ?? SEARCH_PROBE_CAP) < SEARCH_PROBE_CAP;
    const source = rare
      ? Prisma.sql`WITH hits AS MATERIALIZED (
          SELECT m.id, m.content, m."channelId", m."createdAt", m."authorId", m."deletedAt"
          FROM "Message" m WHERE m."deletedAt" IS NULL AND ${matches}
        )`
      : Prisma.empty;
    const from = rare ? Prisma.sql`hits m` : Prisma.sql`"Message" m`;
    const recheck = rare ? Prisma.empty : Prisma.sql`AND ${matches}`;

    const rows = await this.prisma.$queryRaw<SearchRow[]>(Prisma.sql`
      ${source}
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
      FROM ${from}
      JOIN "Channel" c ON c.id = m."channelId"
      JOIN "User" u ON u.id = m."authorId"
      WHERE c."serverId" = ${serverId}::uuid
        AND m."deletedAt" IS NULL
        ${recheck}
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
