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
import { ReadDbService } from '../../infra/prisma/read-db.service.js';
import { RetrievalService } from '../ai/retrieval/retrieval.service.js';
import { reciprocalRankFusion } from './rrf.js';

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
    private readonly readDb: ReadDbService,
    private readonly metrics: MetricsService,
    private readonly retrieval: RetrievalService,
  ) {}

  async search(serverId: string, query: SearchQuery, userId: string): Promise<SearchResultPage> {
    const started = performance.now();
    let outcome: 'ok' | 'error' = 'error';
    try {
      const result = await this.searchResults(serverId, query, userId);
      outcome = 'ok';
      return result;
    } finally {
      this.metrics.searchCompleted((performance.now() - started) / 1_000, outcome);
    }
  }

  private async searchResults(
    serverId: string,
    query: SearchQuery,
    userId: string,
  ): Promise<SearchResultPage> {
    const q = query.q?.trim() ?? '';
    if (q.length === 0 || q.length > Limits.SEARCH_QUERY_MAX) {
      throw new BadRequestException({
        code: ErrorCodes.SEARCH_QUERY_INVALID,
        message: `Query must be 1-${Limits.SEARCH_QUERY_MAX} characters`,
      });
    }

    const rows = await this.keywordRows(serverId, query, q);
    if (query.mode === 'hybrid') return this.hybrid(serverId, query, q, userId, rows);
    return toPage(rows, query.limit);
  }

  private async keywordRows(serverId: string, query: SearchQuery, q: string): Promise<SearchRow[]> {
    const matches = Prisma.sql`(
          m.search @@ websearch_to_tsquery('simple', public.f_unaccent(${q}))
          OR public.f_unaccent(m.content) ILIKE ('%' || public.f_unaccent(${q}) || '%')
        )`;
    // ADR-0095: với từ hiếm, `ORDER BY id LIMIT` khiến planner quét ngược pkey và lọc cả bảng (75-112 s ở 10 triệu tin).
    // Thăm dò có trần: ít khớp thì lấy hàng khớp qua index trước rồi mới sắp xếp.
    // Tìm kiếm chấp nhận dữ liệu cũ vài trăm ms: đọc từ replica khi có (ADR-0102).
    const db = this.readDb.client;
    const [probe] = await db.$queryRaw<{ n: number }[]>(Prisma.sql`
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

    return db.$queryRaw<SearchRow[]>(Prisma.sql`
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
  }

  /**
   * Hybrid (ADR-0103): FTS bắt từ khóa chính xác (mã lỗi, tên riêng), vector bắt nghĩa (không trùng từ). Gộp bằng RRF.
   * Vector hỏng (embedder hoặc Qdrant chết) thì rơi về kết quả từ khóa, không làm lỗi tìm kiếm.
   */
  private async hybrid(
    serverId: string,
    query: SearchQuery,
    q: string,
    userId: string,
    keyword: SearchRow[],
  ): Promise<SearchResultPage> {
    const chunks = await this.retrieval
      .retrieve({
        userId,
        serverId,
        query: q,
        limit: Math.min(20, query.limit),
        channelId: query.channelId,
      })
      .catch(() => []);
    const semantic = new Map<string, SearchRow>();
    const semanticOrder: string[] = [];
    const names = new Map<string, string>();
    const unknownChannels = [
      ...new Set(chunks.flatMap((c) => c.messages.map((m) => m.channelId))),
    ].filter((id) => !keyword.some((row) => row.channelId === id));
    if (unknownChannels.length > 0) {
      for (const channel of await this.readDb.client.channel.findMany({
        where: { id: { in: unknownChannels }, serverId },
        select: { id: true, name: true },
      })) {
        names.set(channel.id, channel.name);
      }
    }
    for (const row of keyword) names.set(row.channelId, row.channelName);
    for (const chunk of chunks) {
      for (const message of chunk.messages) {
        const channelName = names.get(message.channelId);
        if (channelName === undefined) continue; // kênh không thuộc server này: bỏ
        if (query.authorId && message.authorId !== query.authorId) continue;
        if (query.since && message.createdAt < query.since) continue;
        if (semantic.has(message.id)) continue;
        semantic.set(message.id, { ...message, channelName });
        semanticOrder.push(message.id);
      }
    }
    const byId = new Map<string, SearchRow>([
      ...semantic,
      ...keyword.map((r) => [r.id, r] as const),
    ]);
    const fused = reciprocalRankFusion([keyword.map((row) => row.id), semanticOrder]);
    const rows = fused.slice(0, query.limit).flatMap((id) => byId.get(id) ?? []);
    return { results: rows.map(toItem), hasMore: false };
  }
}

function toItem(row: SearchRow): SearchResultItem {
  return {
    id: row.id,
    content: row.content,
    channelId: row.channelId,
    channelName: row.channelName,
    createdAt: row.createdAt.toISOString(),
    authorId: row.authorId,
    author: row.author,
  };
}

function toPage(rows: SearchRow[], limit: number): SearchResultPage {
  const hasMore = rows.length > limit;
  return { results: (hasMore ? rows.slice(0, limit) : rows).map(toItem), hasMore };
}
