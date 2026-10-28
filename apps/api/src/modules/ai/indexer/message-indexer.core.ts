import { ServerEvents } from '@ping/shared';
import type { PrismaClient } from '../../../generated/prisma/client.js';
import type { Embedder } from '../embedder.port.js';
import { collectionName, embeddingVersion } from '../vector-schema.js';
import type { VectorPoint, VectorStore } from '../vector-store.port.js';
import { buildConversationChunk, type ChunkMessage } from './message-chunker.js';

export interface MessageIndexerOptions {
  windowSize: number;
  maxTokens: number;
}

interface IndexedCollection {
  collection: string;
  modelVersion: string;
  dimensions: number;
}

/**
 * Lõi index tin nhắn, không phụ thuộc Redis/Nest để test và script backfill dùng lại.
 *
 * Mỗi point neo vào một tin nhắn; nội dung vector là cửa sổ tin liền trước cùng
 * channel. Khi tin bị sửa/xoá, các point phía sau (tối đa `windowSize - 1` tin)
 * được embed lại vì cửa sổ của chúng chứa tin đó. Payload không chứa nội dung:
 * bước truy vấn (T5.4) luôn hydrate lại từ Postgres sau khi lọc quyền.
 */
export class MessageIndexerCore {
  private indexed: IndexedCollection | undefined;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly embedder: Embedder,
    private readonly store: VectorStore,
    private readonly options: MessageIndexerOptions,
  ) {}

  async handleEvent(type: string, messageId: string): Promise<void> {
    if (type === ServerEvents.MessageDeleted) {
      await this.deleteMessage(messageId);
      return;
    }
    if (type === ServerEvents.MessageUpdated) {
      await this.syncMessageAndFollowers(messageId);
      return;
    }
    if (type === ServerEvents.MessageCreated) {
      await this.syncMessage(messageId);
    }
  }

  /** Upsert point cho một tin; tin đã xoá/không tồn tại thì xoá point cũ. */
  async syncMessage(messageId: string): Promise<void> {
    const anchor = await this.prisma.message.findUnique({
      where: { id: messageId },
      include: {
        author: { select: { displayName: true, username: true } },
        channel: { select: { serverId: true } },
      },
    });

    if (!anchor || anchor.deletedAt) {
      await this.deletePoint(messageId);
      return;
    }

    // TG.9 (ADR-0070 mục 9): DM (channel.serverId NULL) không index cho tìm kiếm AI — bỏ qua
    // trước khi embed. Backfill dùng chung lõi này nên được phủ cùng lúc; FTS đã scope theo
    // serverId sẵn (search.service) và RAG hydrate theo server người hỏi.
    if (anchor.channel.serverId === null) {
      await this.deletePoint(messageId);
      return;
    }

    const previous = await this.prisma.message.findMany({
      where: {
        channelId: anchor.channelId,
        deletedAt: null,
        id: { lt: anchor.id },
      },
      orderBy: { id: 'desc' },
      take: this.options.windowSize - 1,
      include: { author: { select: { displayName: true, username: true } } },
    });

    const messages: ChunkMessage[] = [...previous.reverse(), anchor].map((message) => ({
      id: message.id,
      author: message.author.displayName || message.author.username,
      content: message.content,
    }));
    const chunk = buildConversationChunk(messages, this.options.maxTokens);

    const indexed = await this.ensureIndexed();
    const embedded = await this.embedder.embed([chunk.text], 'passage');
    const vector = embedded.vectors[0];
    if (!vector) {
      throw new Error(`Embedding rỗng cho tin ${anchor.id}`);
    }

    const point: VectorPoint = {
      id: anchor.id,
      vector,
      payload: {
        serverId: anchor.channel.serverId,
        channelId: anchor.channelId,
        authorId: anchor.authorId,
        createdAt: anchor.createdAt.toISOString(),
        messageIds: chunk.messageIds,
        modelVersion: indexed.modelVersion,
      },
    };
    await this.store.upsert(indexed.collection, [point]);
  }

  /** Sửa tin: embed lại chính nó và các tin phía sau có cửa sổ chứa nó. */
  async syncMessageAndFollowers(messageId: string): Promise<void> {
    await this.syncMessage(messageId);
    await this.syncFollowers(messageId);
  }

  async deleteMessage(messageId: string): Promise<void> {
    const row = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { channelId: true },
    });
    await this.deletePoint(messageId);
    if (row) {
      await this.syncFollowers(messageId);
    }
  }

  private async syncFollowers(messageId: string): Promise<void> {
    const anchor = await this.prisma.message.findUnique({
      where: { id: messageId },
      select: { channelId: true },
    });
    if (!anchor) return;

    const followers = await this.prisma.message.findMany({
      where: {
        channelId: anchor.channelId,
        deletedAt: null,
        id: { gt: messageId },
      },
      orderBy: { id: 'asc' },
      take: this.options.windowSize - 1,
      select: { id: true },
    });
    for (const follower of followers) {
      await this.syncMessage(follower.id);
    }
  }

  private async deletePoint(messageId: string): Promise<void> {
    const indexed = await this.ensureIndexed();
    await this.store.deleteByMessageIds(indexed.collection, [messageId]);
  }

  private async ensureIndexed(): Promise<IndexedCollection> {
    if (this.indexed) return this.indexed;

    // Chưa biết số chiều trước khi model chạy: embed một câu thăm dò rồi tạo collection.
    const probe = await this.embedder.embed(['khởi tạo chỉ mục'], 'passage');
    const dimensions = probe.dimensions;
    const collection = collectionName(this.embedder.model, dimensions);
    await this.store.ensureCollection(collection, dimensions);
    this.indexed = {
      collection,
      dimensions,
      modelVersion: embeddingVersion(this.embedder.model, dimensions),
    };
    return this.indexed;
  }
}
