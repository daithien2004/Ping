import { ForbiddenException, NotFoundException, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Permissions } from '@ping/shared';
import { randomUUID } from 'node:crypto';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { AbilityFactory } from '../src/modules/ability/ability.factory.js';
import { EMBEDDER, VECTOR_STORE } from '../src/modules/ai/ai.tokens.js';
import { FakeEmbedder } from '../src/modules/ai/fake-embedder.js';
import { RetrievalService } from '../src/modules/ai/retrieval/retrieval.service.js';
import { collectionName } from '../src/modules/ai/vector-schema.js';
import type {
  VectorSearchHit,
  VectorSearchOptions,
  VectorStore,
} from '../src/modules/ai/vector-store.port.js';

const runId = Date.now().toString(36);
const embedder = new FakeEmbedder(8);

class StubVectorStore implements VectorStore {
  hits: VectorSearchHit[] = [];
  searchCalls: {
    collection: string;
    vector: readonly number[];
    options: VectorSearchOptions;
  }[] = [];

  async search(
    collection: string,
    vector: readonly number[],
    options: VectorSearchOptions,
  ): Promise<VectorSearchHit[]> {
    this.searchCalls.push({ collection, vector, options });
    return this.hits;
  }

  async ensureCollection(): Promise<void> {}
  async upsert(): Promise<void> {}
  async deleteByMessageIds(): Promise<void> {}
  async count(): Promise<number> {
    return 0;
  }
  async deleteCollection(): Promise<void> {}
  async health(): Promise<boolean> {
    return true;
  }
}

interface TestServer {
  id: string;
  channels: { id: string; name: string }[];
}

interface TestMessage {
  id: string;
  channelId: string;
  authorId: string;
  createdAt: Date;
  content: string;
}

describe('Retrieval ACL (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let retrieval: RetrievalService;
  let abilityFactory: AbilityFactory;
  let sequence = 0;
  let userIds: string[] = [];
  let serverIds: string[] = [];

  const store = new StubVectorStore();

  function unique(prefix: string): string {
    sequence += 1;
    return `${prefix}-${runId}-${sequence}`;
  }

  async function createUser(): Promise<string> {
    const user = await prisma.user.create({
      data: {
        email: `${unique('retrieval')}@ping.dev`,
        username: unique('r').slice(0, 32),
        displayName: 'Retrieval User',
        passwordHash: 'not-used',
      },
    });
    userIds.push(user.id);
    return user.id;
  }

  async function createServer(
    ownerId: string,
    permissions: bigint = Permissions.VIEW_CHANNEL,
  ): Promise<TestServer> {
    const server = await prisma.server.create({
      data: {
        name: unique('server'),
        ownerId,
        inviteCode: randomUUID(),
        roles: {
          create: {
            name: '@everyone',
            permissions,
            isDefault: true,
            position: 0,
          },
        },
        channels: {
          create: [{ name: 'general' }, { name: 'random' }],
        },
      },
      include: { channels: { select: { id: true, name: true } } },
    });
    serverIds.push(server.id);
    await prisma.member.create({ data: { serverId: server.id, userId: ownerId } });
    return { id: server.id, channels: server.channels };
  }

  async function addMember(serverId: string, userId: string): Promise<void> {
    await prisma.member.create({ data: { serverId, userId } });
  }

  async function createMessage(
    channelId: string,
    authorId: string,
    content: string,
  ): Promise<TestMessage> {
    return prisma.message.create({
      data: { channelId, authorId, content },
      select: { id: true, channelId: true, authorId: true, createdAt: true, content: true },
    });
  }

  function hit(
    serverId: string,
    anchor: TestMessage,
    messageIds: string[] = [anchor.id],
    overrides: Partial<VectorSearchHit['payload']> = {},
  ): VectorSearchHit {
    return {
      id: anchor.id,
      score: 0.9,
      payload: {
        serverId,
        channelId: anchor.channelId,
        authorId: anchor.authorId,
        createdAt: anchor.createdAt.toISOString(),
        messageIds,
        modelVersion: `${embedder.model}:8:schema1`,
        ...overrides,
      },
    };
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EMBEDDER)
      .useValue(embedder)
      .overrideProvider(VECTOR_STORE)
      .useValue(store)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    retrieval = app.get(RetrievalService);
    abilityFactory = app.get(AbilityFactory);
  });

  beforeEach(() => {
    store.hits = [];
    store.searchCalls = [];
  });

  afterEach(async () => {
    await prisma.server.deleteMany({ where: { id: { in: serverIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    serverIds = [];
    userIds = [];
  });

  afterAll(async () => {
    await app.close();
  });

  it('trả chunk đã hydrate, đúng thứ tự, cho member có quyền xem', async () => {
    const ownerId = await createUser();
    const server = await createServer(ownerId);
    const channel = server.channels[0]!;
    const first = await createMessage(channel.id, ownerId, 'tin thứ nhất');
    const second = await createMessage(channel.id, ownerId, 'tin thứ hai');
    store.hits = [hit(server.id, second, [first.id, second.id])];

    const result = await retrieval.retrieve({
      userId: ownerId,
      serverId: server.id,
      query: 'tin thứ hai nói gì',
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.messages.map((message) => message.content)).toEqual([
      'tin thứ nhất',
      'tin thứ hai',
    ]);
    expect(result[0]?.messages[0]?.createdAt).toBeInstanceOf(Date);
    expect(store.searchCalls[0]?.collection).toBe(collectionName(embedder.model, 8));
    expect(store.searchCalls[0]?.options).toEqual({
      serverId: server.id,
      channelId: undefined,
      limit: 24,
    });
  });

  it('không phải member thì 403 trước khi chạm vector store', async () => {
    const ownerId = await createUser();
    const outsiderId = await createUser();
    const server = await createServer(ownerId);
    const channel = server.channels[0]!;
    const message = await createMessage(channel.id, ownerId, 'nội dung riêng');
    store.hits = [hit(server.id, message)];

    await expect(
      retrieval.retrieve({ userId: outsiderId, serverId: server.id, query: 'nội dung' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(store.searchCalls).toHaveLength(0);
  });

  it('user vừa bị kick vẫn bị chặn dù cache ability còn member', async () => {
    const ownerId = await createUser();
    const memberId = await createUser();
    const server = await createServer(ownerId);
    await addMember(server.id, memberId);
    const channel = server.channels[0]!;
    const message = await createMessage(channel.id, ownerId, 'tin của server');
    store.hits = [hit(server.id, message)];

    // Cache 30 giây có context member; retrieval vẫn phải đọc Postgres.
    await expect(abilityFactory.contextFor(server.id, memberId)).resolves.toBeDefined();
    await prisma.member.delete({
      where: { serverId_userId: { serverId: server.id, userId: memberId } },
    });

    await expect(
      retrieval.retrieve({ userId: memberId, serverId: server.id, query: 'tin' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(store.searchCalls).toHaveLength(0);
  });

  it('member thiếu VIEW_CHANNEL thì 403, không tìm vector', async () => {
    const ownerId = await createUser();
    const memberId = await createUser();
    const server = await createServer(ownerId, 0n);
    await addMember(server.id, memberId);
    const channel = server.channels[0]!;
    const message = await createMessage(channel.id, ownerId, 'không được xem');
    store.hits = [hit(server.id, message)];

    await expect(
      retrieval.retrieve({ userId: memberId, serverId: server.id, query: 'không' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(store.searchCalls).toHaveLength(0);
  });

  it('tin vừa xoá làm cả chunk bị loại, không trả nội dung cũ', async () => {
    const ownerId = await createUser();
    const server = await createServer(ownerId);
    const channel = server.channels[0]!;
    const kept = await createMessage(channel.id, ownerId, 'tin còn lại');
    const removed = await createMessage(channel.id, ownerId, 'tin đã xoá');
    store.hits = [hit(server.id, removed, [kept.id, removed.id])];
    await prisma.message.update({
      where: { id: removed.id },
      data: { deletedAt: new Date() },
    });

    const result = await retrieval.retrieve({
      userId: ownerId,
      serverId: server.id,
      query: 'tin',
    });

    expect(result).toEqual([]);
    expect(JSON.stringify(result)).not.toContain('tin đã xoá');
  });

  it('payload trỏ sang message của server khác bị loại toàn bộ', async () => {
    const ownerA = await createUser();
    const ownerB = await createUser();
    const serverA = await createServer(ownerA);
    const serverB = await createServer(ownerB);
    const channelA = serverA.channels[0]!;
    const channelB = serverB.channels[0]!;
    const messageA = await createMessage(channelA.id, ownerA, 'tin A');
    const messageB = await createMessage(channelB.id, ownerB, 'tin B bí mật');
    store.hits = [hit(serverA.id, messageA, [messageB.id, messageA.id])];

    const result = await retrieval.retrieve({
      userId: ownerA,
      serverId: serverA.id,
      query: 'tin',
    });

    expect(result).toEqual([]);
    expect(JSON.stringify(result)).not.toContain('tin B bí mật');
  });

  it('payload khai server khác bị loại trước khi hydrate', async () => {
    const ownerA = await createUser();
    const ownerB = await createUser();
    const serverA = await createServer(ownerA);
    const serverB = await createServer(ownerB);
    const channelB = serverB.channels[0]!;
    const messageB = await createMessage(channelB.id, ownerB, 'tin B bí mật');
    store.hits = [hit(serverB.id, messageB)];

    const result = await retrieval.retrieve({
      userId: ownerA,
      serverId: serverA.id,
      query: 'tin',
    });

    expect(result).toEqual([]);
    expect(store.searchCalls).toHaveLength(1);
    expect(store.searchCalls[0]?.options.serverId).toBe(serverA.id);
    expect(JSON.stringify(result)).not.toContain('tin B bí mật');
  });

  it('payload hỏng (message id không phải UUID, thiếu neo) bị bỏ, không làm sập request', async () => {
    const ownerId = await createUser();
    const server = await createServer(ownerId);
    const channel = server.channels[0]!;
    const message = await createMessage(channel.id, ownerId, 'tin hợp lệ');
    store.hits = [
      hit(server.id, message, ['không-phải-uuid', message.id]),
      // Point id không khớp tin neo cuối cửa sổ: payload hỏng, phải bỏ.
      { ...hit(server.id, message), id: randomUUID() },
    ];

    const result = await retrieval.retrieve({
      userId: ownerId,
      serverId: server.id,
      query: 'tin',
    });

    expect(result).toEqual([]);
  });

  it('lọc channel: chỉ trả point đúng channel và channel phải thuộc server', async () => {
    const ownerId = await createUser();
    const otherOwnerId = await createUser();
    const server = await createServer(ownerId);
    const otherServer = await createServer(otherOwnerId);
    const first = server.channels[0]!;
    const second = server.channels[1]!;
    const otherChannel = otherServer.channels[0]!;
    const wrong = await createMessage(first.id, ownerId, 'tin channel một');
    const right = await createMessage(second.id, ownerId, 'tin channel hai');
    store.hits = [hit(server.id, wrong), hit(server.id, right)];

    const result = await retrieval.retrieve({
      userId: ownerId,
      serverId: server.id,
      channelId: second.id,
      query: 'tin',
    });

    expect(result).toHaveLength(1);
    expect(result[0]?.messages.map((message) => message.content)).toEqual(['tin channel hai']);
    expect(store.searchCalls[0]?.options.channelId).toBe(second.id);

    await expect(
      retrieval.retrieve({
        userId: ownerId,
        serverId: server.id,
        channelId: otherChannel.id,
        query: 'tin',
      }),
    ).rejects.toBeInstanceOf(NotFoundException);
    expect(store.searchCalls).toHaveLength(1);
  });
});
