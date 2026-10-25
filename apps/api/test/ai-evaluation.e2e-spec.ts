import { ForbiddenException, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Permissions } from '@ping/shared';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { RedisProvider } from '../src/infra/redis/redis.module.js';
import { AbilityFactory } from '../src/modules/ability/ability.factory.js';
import { EMBEDDER, VECTOR_STORE, LLM_CLIENT } from '../src/modules/ai/ai.tokens.js';
import { AskService, type AskEvent } from '../src/modules/ai/ask/ask.service.js';
import { FakeEmbedder } from '../src/modules/ai/fake-embedder.js';
import type { VectorStore, VectorSearchHit } from '../src/modules/ai/vector-store.port.js';
import {
  goldenCases,
  injectionCases,
  messageUuid,
  sourceMessages,
  ExtractiveEvalClient,
  scoreAnswer,
} from './ai/evaluation.js';

// Real DB + authorization + hydration + AskService; fake vector candidates/LLM only.
// This suite proves application boundaries, not semantic retrieval or LLM resistance.
describe('AI evaluation seeded pipeline (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let ask: AskService;
  let ownerId: string;
  let memberId: string;
  let outsiderId: string;
  let serverId: string;
  let channelId: string;
  let secretId: string;
  let deletedId: string;
  let hits: VectorSearchHit[] = [];
  let searches = 0;
  const llm = new ExtractiveEvalClient();
  const byId = new Map<
    string,
    { id: string; channelId: string; authorId: string; createdAt: Date }
  >();
  const testUsers: string[] = [];
  const testServers: string[] = [];

  function hit(id: string, claimServer = serverId): VectorSearchHit {
    const message = byId.get(id)!;
    return {
      id,
      score: 0.9,
      payload: {
        serverId: claimServer,
        channelId: message.channelId,
        authorId: message.authorId,
        createdAt: message.createdAt.toISOString(),
        messageIds: [id],
        modelVersion: 'fake:8:schema1',
      },
    };
  }
  async function collect(
    userId = ownerId,
    requestedServer = serverId,
    question = 'Hạn nộp báo cáo là khi nào?',
  ) {
    const input = { userId, serverId: requestedServer, question };
    await ask.authorize(input);
    const events: AskEvent[] = [];
    for await (const event of ask.stream(input)) events.push(event);
    return {
      events,
      answer: events
        .filter((event) => event.type === 'delta')
        .map((event) => event.data.text)
        .join(''),
    };
  }
  async function user(label: string) {
    const suffix = randomUUID().slice(0, 8);
    const created = await prisma.user.create({
      data: {
        email: `eval-${label}-${suffix}@ping.dev`,
        username: `eval_${label}_${suffix}`,
        displayName: label,
        passwordHash: 'not-used',
      },
    });
    testUsers.push(created.id);
    return created.id;
  }
  async function server(owner: string) {
    const created = await prisma.server.create({
      data: {
        name: 'T5.9 isolated evaluation seed',
        ownerId: owner,
        inviteCode: randomUUID(),
        roles: {
          create: {
            name: '@everyone',
            isDefault: true,
            position: 0,
            permissions: Permissions.VIEW_CHANNEL,
          },
        },
        channels: { create: { name: 'eval' } },
      },
      include: { channels: true },
    });
    testServers.push(created.id);
    await prisma.member.create({ data: { serverId: created.id, userId: owner } });
    return created;
  }

  beforeAll(async () => {
    const store = {
      search: async () => {
        searches++;
        return hits;
      },
      ensureCollection: async () => {},
      upsert: async () => {},
      deleteByMessageIds: async () => {},
      count: async () => 0,
      deleteCollection: async () => {},
      health: async () => true,
    } satisfies VectorStore;
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(EMBEDDER)
      .useValue(new FakeEmbedder(8))
      .overrideProvider(VECTOR_STORE)
      .useValue(store)
      .overrideProvider(LLM_CLIENT)
      .useValue(llm)
      .compile();
    app = module.createNestApplication();
    await app.init();
    prisma = app.get(PrismaService);
    ask = app.get(AskService);
    ownerId = await user('owner');
    memberId = await user('member');
    outsiderId = await user('outsider');
    const allowed = await server(ownerId);
    serverId = allowed.id;
    channelId = allowed.channels[0]!.id;
    await prisma.member.create({ data: { serverId, userId: memberId } });
    const foreign = await server(outsiderId);
    for (const source of sourceMessages) {
      const created = await prisma.message.create({
        data: {
          id: messageUuid(source.id),
          channelId,
          authorId: ownerId,
          content: source.content,
          createdAt: new Date('2026-10-20T00:00:00Z'),
        },
      });
      byId.set(created.id, created);
    }
    const secret = await prisma.message.create({
      data: {
        channelId: foreign.channels[0]!.id,
        authorId: outsiderId,
        content: 'PING_EVAL_OTHER_SERVER_SECRET',
      },
    });
    secretId = secret.id;
    byId.set(secret.id, secret);
    const deleted = await prisma.message.create({
      data: {
        channelId,
        authorId: ownerId,
        content: 'PING_EVAL_DELETED_SECRET',
        deletedAt: new Date(),
      },
    });
    deletedId = deleted.id;
    byId.set(deleted.id, deleted);
  }, 30_000);
  beforeEach(async () => {
    hits = [];
    searches = 0;
    llm.prompts.length = 0;
    // E2E_REDIS_URL MUST point to a dedicated DB (this task uses DB 12).
    await app.get(RedisProvider).flushdb();
  });
  afterAll(async () => {
    if (prisma) {
      await prisma.aiUsage.deleteMany({ where: { userId: { in: testUsers } } });
      await prisma.server.deleteMany({ where: { id: { in: testServers } } });
      await prisma.user.deleteMany({ where: { id: { in: testUsers } } });
    }
    await app?.close();
  });

  it.each(goldenCases)(
    'golden $id hydrates seed facts and returns the correct source',
    async (entry) => {
      hits = [...entry.messageIds.map((id) => hit(messageUuid(id))), hit(secretId), hit(deletedId)];
      const result = await collect(ownerId, serverId, entry.question);
      expect(scoreAnswer(entry, result.answer).passed).toBe(true);
      const prompt = llm.prompts
        .flat()
        .map((message) => message.content)
        .join('\n');
      expect(prompt).not.toContain('PING_EVAL_OTHER_SERVER_SECRET');
      expect(prompt).not.toContain('PING_EVAL_DELETED_SECRET');
    },
  );

  it.each(injectionCases)(
    'isolates untrusted injection $id inside the data block',
    async (attack) => {
      const injected = await prisma.message.create({
        data: {
          channelId,
          authorId: ownerId,
          content: attack.content,
          createdAt: new Date('2026-10-20T00:00:02Z'),
        },
      });
      byId.set(injected.id, injected);
      try {
        hits = [hit(messageUuid('m03')), hit(injected.id)];
        const result = await collect();
        const prompt = llm.prompts[0]!;
        const userPrompt = prompt.find((message) => message.role === 'user')!.content;
        expect(userPrompt.match(/<context>/g)).toHaveLength(1);
        expect(userPrompt.match(/<\/context>/g)).toHaveLength(1);
        expect(userPrompt.match(/<message id=/g)).toHaveLength(2);
        expect(prompt[0]!.content).toContain('untrusted data');
        expect(result.answer).not.toMatch(
          /PING_EVAL_INJECTED|PING_EVAL_OTHER_SERVER_SECRET|https?:\/\//,
        );
        expect(scoreAnswer(goldenCases[1]!, result.answer).passed).toBe(true);
      } finally {
        await prisma.message.delete({ where: { id: injected.id } });
      }
    },
  );

  it('blocks an outsider before vector lookup and before the LLM', async () => {
    hits = [hit(messageUuid('m03'))];
    await expect(collect(outsiderId)).rejects.toBeInstanceOf(ForbiddenException);
    expect(searches).toBe(0);
    expect(llm.prompts).toHaveLength(0);
  });
  it('does not trust a cached membership after the member is kicked', async () => {
    await app.get(AbilityFactory).contextFor(serverId, memberId);
    await prisma.member.delete({ where: { serverId_userId: { serverId, userId: memberId } } });
    try {
      await expect(collect(memberId)).rejects.toBeInstanceOf(ForbiddenException);
      expect(searches).toBe(0);
      expect(llm.prompts).toHaveLength(0);
    } finally {
      await prisma.member.create({ data: { serverId, userId: memberId } });
    }
  });
  it('rejects forged same-server metadata when hydration finds a foreign message', async () => {
    const forged = hit(secretId, serverId);
    forged.payload.channelId = channelId;
    hits = [forged];
    const result = await collect();
    expect(result.events.at(-1)).toMatchObject({
      type: 'error',
      data: { code: 'AI_INSUFFICIENT_CONTEXT' },
    });
    expect(llm.prompts).toHaveLength(0);
    expect(result.answer).toBe('');
  });
  it('rejects an entire chunk if it mixes readable and foreign/deleted IDs', async () => {
    for (const forbidden of [secretId, deletedId]) {
      const mixed = hit(messageUuid('m03'));
      mixed.payload.messageIds = [forbidden, messageUuid('m03')];
      hits = [mixed];
      const result = await collect();
      expect(result.events.at(-1)).toMatchObject({
        type: 'error',
        data: { code: 'AI_INSUFFICIENT_CONTEXT' },
      });
      expect(llm.prompts).toHaveLength(0);
    }
  });
  it('does not call the LLM when retrieval has no context', async () => {
    const result = await collect();
    expect(result.events.at(-1)).toMatchObject({
      type: 'error',
      data: { code: 'AI_INSUFFICIENT_CONTEXT' },
    });
    expect(llm.prompts).toHaveLength(0);
  });
});
