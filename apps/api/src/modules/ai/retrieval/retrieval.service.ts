import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { z } from 'zod';
import { PrismaService } from '../../../infra/prisma/prisma.service.js';
import { AbilityFactory } from '../../ability/ability.factory.js';
import { EMBEDDER, VECTOR_STORE } from '../ai.tokens.js';
import type { Embedder } from '../embedder.port.js';
import { collectionName } from '../vector-schema.js';
import type { VectorPayload, VectorSearchHit, VectorStore } from '../vector-store.port.js';

const uuid = z.uuid();

const DEFAULT_LIMIT = 8;
const MAX_LIMIT = 50;
/** Một chunk hợp lệ không thể dài hơn cửa sổ indexer; chặn payload bị sửa tay. */
const MAX_MESSAGES_PER_CHUNK = 50;
/** Lấy dư ứng viên vì point của tin đã xoá có thể bị lọc ở bước hydrate. */
const CANDIDATE_FACTOR = 3;
const MAX_CANDIDATES = 150;
const MAX_QUERY_LENGTH = 2_000;

/**
 * Một mẩu ngữ cảnh đã qua kiểm quyền. `messages` giữ thứ tự cửa sổ hội thoại
 * (cũ → mới) đúng như lúc index.
 */
export interface RetrievedChunk {
  score: number;
  messages: RetrievedMessage[];
}

export interface RetrievedMessage {
  id: string;
  channelId: string;
  authorId: string;
  content: string;
  createdAt: Date;
  author: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl: string | null;
  };
}

export interface RetrievalInput {
  userId: string;
  serverId: string;
  query: string;
  limit?: number;
  /** Chỉ tìm trong một channel; channel phải thuộc `serverId`. */
  channelId?: string;
}

const hydratedMessageSelect = {
  id: true,
  channelId: true,
  authorId: true,
  content: true,
  createdAt: true,
  deletedAt: true,
  channel: { select: { serverId: true } },
  author: { select: { id: true, username: true, displayName: true, avatarUrl: true } },
} as const;

/**
 * Truy xuất vector có kiểm soát quyền (ADR-0048).
 *
 * Thứ tự cố định, không được đảo:
 * 1. Đọc membership + quyền từ **Postgres**, bỏ qua cache ability (cache có thể
 *    còn member đã bị kick tới 30 giây).
 * 2. Chỉ tìm vector trong `serverId` (và `channelId` nếu có) — Qdrant không bao
 *    giờ là nguồn quyết định quyền.
 * 3. Hydrate lại **toàn bộ** `messageIds` từ Postgres. Một chunk chỉ được trả
 *    khi mọi tin còn tồn tại, chưa soft-delete, cùng server/channel với point.
 * 4. Chỉ sau đó mới trả nội dung cho tầng RAG/prompt.
 *
 * Bước 3 cố ý fail-closed theo từng chunk: vector được sinh từ cả cửa sổ, nên
 * trả một phần của cửa sổ vừa làm prompt sai vừa có thể che giấu tin vừa xoá.
 */
@Injectable()
export class RetrievalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly abilityFactory: AbilityFactory,
    @Inject(EMBEDDER) private readonly embedder: Embedder,
    @Inject(VECTOR_STORE) private readonly store: VectorStore,
  ) {}

  async retrieve(input: RetrievalInput): Promise<RetrievedChunk[]> {
    const query = input.query.trim();
    if (query.length === 0 || query.length > MAX_QUERY_LENGTH) {
      throw new BadRequestException('Query is empty or too long');
    }
    const requestedLimit = input.limit ?? DEFAULT_LIMIT;
    const limit = Math.min(
      Math.max(Number.isFinite(requestedLimit) ? Math.trunc(requestedLimit) : DEFAULT_LIMIT, 1),
      MAX_LIMIT,
    );

    // (1) Postgres trước mọi thứ khác. `createForUserFresh` ném 403 nếu user
    // không còn là member; không dùng contextFor vì cache có TTL 30 giây.
    const ability = await this.abilityFactory.createForUserFresh(input.serverId, input.userId);
    if (!ability.can('view', 'Message')) {
      throw new ForbiddenException('You cannot view messages in this server');
    }

    if (input.channelId) {
      const channel = await this.prisma.channel.findFirst({
        where: { id: input.channelId, serverId: input.serverId },
        select: { id: true },
      });
      if (!channel) {
        // Không tiết lộ channel của server khác tồn tại hay không.
        throw new NotFoundException('Channel not found');
      }
    }

    const embedded = await this.embedder.embed([query], 'query');
    const vector = embedded.vectors[0];
    if (!vector || vector.length === 0) {
      throw new Error('Embedding truy vấn rỗng');
    }
    const collection = collectionName(embedded.model, embedded.dimensions);
    const candidateLimit = Math.min(limit * CANDIDATE_FACTOR, MAX_CANDIDATES);

    // (2) Lọc server ngay trong vector store.
    const hits = await this.store.search(collection, vector, {
      serverId: input.serverId,
      channelId: input.channelId,
      limit: candidateLimit,
    });
    if (hits.length === 0) return [];

    const eligible = hits.filter((hit) =>
      this.eligiblePayload(hit, input.serverId, input.channelId),
    );
    if (eligible.length === 0) return [];

    const messageIds = [...new Set(eligible.flatMap((hit) => hit.payload.messageIds))];
    // (3) Hydrate từ Postgres — nội dung không bao giờ lấy từ Qdrant.
    const rows = await this.prisma.message.findMany({
      where: { id: { in: messageIds } },
      select: hydratedMessageSelect,
    });
    const byId = new Map(rows.map((row) => [row.id, row]));

    const results: RetrievedChunk[] = [];
    for (const hit of eligible) {
      const messages: RetrievedMessage[] = [];
      let valid = true;
      for (const messageId of hit.payload.messageIds) {
        const row = byId.get(messageId);
        if (
          !row ||
          row.deletedAt ||
          row.channelId !== hit.payload.channelId ||
          row.channel.serverId !== input.serverId
        ) {
          valid = false;
          break;
        }
        messages.push({
          id: row.id,
          channelId: row.channelId,
          authorId: row.authorId,
          content: row.content,
          createdAt: row.createdAt,
          author: row.author,
        });
      }
      if (!valid) continue;
      results.push({ score: hit.score, messages });
      if (results.length >= limit) break;
    }

    // (4) Chỉ nội dung đã hydrate + kiểm quyền mới rời khỏi service.
    return results;
  }

  private eligiblePayload(
    hit: VectorSearchHit,
    serverId: string,
    channelId: string | undefined,
  ): boolean {
    if (!this.isValidPayload(hit.payload)) return false;
    if (hit.payload.serverId !== serverId) return false;
    if (channelId && hit.payload.channelId !== channelId) return false;
    // Point id phải là tin neo nằm cuối cửa sổ; payload lệch là dữ liệu hỏng.
    if (hit.payload.messageIds.at(-1) !== hit.id) return false;
    return true;
  }

  private isValidPayload(payload: VectorPayload): boolean {
    const ids: unknown = (payload as Partial<VectorPayload>).messageIds;
    return (
      Array.isArray(ids) &&
      ids.length > 0 &&
      ids.length <= MAX_MESSAGES_PER_CHUNK &&
      ids.every((id) => typeof id === 'string' && uuid.safeParse(id).success)
    );
  }
}
