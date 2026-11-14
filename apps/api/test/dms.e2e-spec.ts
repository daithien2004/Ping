import type { INestApplication } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ErrorCodes, type ChannelActivityPayload, type MessageCreatedPayload } from '@ping/shared';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { RedisProvider } from '../src/infra/redis/redis.module.js';
import { AttachmentWorker } from '../src/modules/attachments/attachment-worker.js';
import { LocalStorage } from '../src/modules/attachments/local-storage.js';
import { MessageIndexerCore } from '../src/modules/ai/indexer/message-indexer.core.js';
import { FakeEmbedder } from '../src/modules/ai/fake-embedder.js';
import type {
  VectorPoint,
  VectorSearchHit,
  VectorStore,
} from '../src/modules/ai/vector-store.port.js';
import { bootApp } from './helpers/boot.js';

const runId = Date.now().toString(36);
const pngPromise: Promise<Buffer> = import('sharp').then((sharp) =>
  sharp
    .default({ create: { width: 20, height: 12, channels: 3, background: 'red' } })
    .withMetadata()
    .png()
    .toBuffer(),
);

interface TestUser {
  id: string;
  token: string;
}

describe('DM 1:1 + user blocks (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let worker: AttachmentWorker;
  const emails: string[] = [];
  const sockets: Socket[] = [];
  const dmChannelIds: string[] = [];
  const attachmentIds: string[] = [];

  let alice: TestUser;
  let bob: TestUser;
  let carol: TestUser;
  let dave: TestUser;
  let spammer: TestUser;
  let u1 = '';
  let u2 = '';
  const partners: string[] = [];
  let u11 = '';

  let serverId = '';
  let serverGeneral = '';
  let spamServerId = '';
  let dmId = '';
  let dmMessageId = '';
  let dmAttachmentId = '';

  const unique = () => Math.random().toString(36).slice(2, 8);

  async function registerUser(prefix: string): Promise<TestUser> {
    const email = `dm-${prefix}-${runId}-${unique()}@ping.dev`;
    emails.push(email);
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({
        email,
        username: `dm${prefix}${runId}${unique()}`.slice(0, 32),
        password: 'password123',
        displayName: `DM ${prefix.toUpperCase()}`,
      })
      .expect(201);
    return { id: res.body.user.id, token: res.body.accessToken };
  }

  async function seedUser(label: string): Promise<string> {
    const row = await prisma.user.create({
      data: {
        email: `dm-seed-${label}-${runId}-${unique()}@ping.dev`,
        username: `dmseed${label}${runId}${unique()}`.slice(0, 32),
        displayName: `Seed ${label}`,
        passwordHash: 'seeded-not-loginable',
      },
      select: { id: true },
    });
    return row.id;
  }

  async function seedMember(serverIdOfMember: string, userId: string): Promise<void> {
    await prisma.member.create({ data: { serverId: serverIdOfMember, userId } });
  }

  function api(method: 'get' | 'post' | 'put' | 'patch' | 'delete', url: string, token?: string) {
    const agent = request(app.getHttpServer());
    const call = {
      get: () => agent.get(url),
      post: () => agent.post(url),
      put: () => agent.put(url),
      patch: () => agent.patch(url),
      delete: () => agent.delete(url),
    }[method]();
    return token ? call.set('Authorization', `Bearer ${token}`) : call;
  }

  function waitEvent<T>(socket: Socket, event: string, timeoutMs = 5000): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        socket.off(event, handler);
        reject(new Error(`Timeout: không nhận được "${event}"`));
      }, timeoutMs);
      const handler = (payload: T) => {
        clearTimeout(timer);
        resolve(payload);
      };
      socket.once(event, handler);
    });
  }

  async function assertNoEvent(socket: Socket, event: string, waitMs = 1000): Promise<boolean> {
    const seen = await Promise.race([
      new Promise<boolean>((resolve) => socket.once(event, () => resolve(true))),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), waitMs)),
    ]);
    return seen;
  }

  function connectClient(token: string): Promise<Socket> {
    const port = (app.getHttpServer().address() as { port: number }).port;
    return new Promise((resolve, reject) => {
      const socket = io(`http://127.0.0.1:${port}`, {
        transports: ['websocket'],
        auth: { token },
        reconnection: false,
      });
      sockets.push(socket);
      socket.once('connect', () => resolve(socket));
      socket.once('connect_error', reject);
    });
  }

  function socketJoin(socket: Socket, channelId: string): Promise<{ ok: boolean; code?: string }> {
    return new Promise((resolve) => {
      socket.emit('channel.join', { channelId }, (result: { ok: boolean; code?: string }) =>
        resolve(result),
      );
    });
  }

  async function readyAttachment(token: string, channelId: string): Promise<string> {
    const bytes = await pngPromise;
    const res = await api('post', '/api/v1/uploads', token)
      .send({ channelId, filename: 'dm-picture.png', sizeBytes: bytes.length, nonce: randomUUID() })
      .expect(201);
    const id = res.body.id as string;
    attachmentIds.push(id);
    await api('put', `/api/v1/uploads/${id}/content`, token)
      .set('Content-Type', 'application/octet-stream')
      .send(bytes)
      .expect(200);
    await api('post', `/api/v1/uploads/${id}/complete`, token).expect(201);
    for (let i = 0; i < 20; i += 1) {
      await worker.runOnce();
      const row = await prisma.attachment.findUniqueOrThrow({ where: { id } });
      if (row.status === 'ready') return id;
      if (row.status === 'rejected') throw new Error('attachment rejected');
    }
    throw new Error('Worker did not finish');
  }

  beforeAll(async () => {
    app = await bootApp({ websocket: true });
    prisma = app.get(PrismaService);
    worker = app.get(AttachmentWorker);
    await app.get(RedisProvider).flushdb();

    alice = await registerUser('a');
    bob = await registerUser('b');
    carol = await registerUser('c');
    dave = await registerUser('d');
    spammer = await registerUser('s');

    const server = await api('post', '/api/v1/servers', alice.token)
      .send({ name: `DM Test ${runId}` })
      .expect(201);
    serverId = server.body.id;
    serverGeneral = server.body.channels[0].id;
    for (const user of [bob, carol]) {
      await api('post', '/api/v1/servers/join', user.token)
        .send({ inviteCode: server.body.inviteCode })
        .expect(201);
    }

    const spamServer = await api('post', '/api/v1/servers', spammer.token)
      .send({ name: `Spam Test ${runId}` })
      .expect(201);
    spamServerId = spamServer.body.id;

    for (let i = 1; i <= 10; i += 1) {
      const id = await seedUser(`u${i}`);
      partners.push(id);
      await seedMember(spamServerId, id);
    }
    u1 = partners[0];
    await seedMember(serverId, u1);
    u2 = await seedUser('u2');
    await seedMember(spamServerId, u2);
    u11 = await seedUser('u11');
    await seedMember(spamServerId, u11);

    const emojiAttachment = await prisma.attachment.create({
      data: {
        uploaderId: alice.id,
        nonce: randomUUID(),
        filename: 'dm-emoji.webp',
        sizeBytes: 64,
        quotaBytes: 64,
        scope: 'customEmoji',
        serverId,
        status: 'ready',
        boundAt: new Date(),
        rawRemoved: true,
        mime: 'image/webp',
        width: 8,
        height: 8,
      },
    });
    attachmentIds.push(emojiAttachment.id);
    await prisma.customEmoji.create({
      data: {
        serverId,
        name: 'dmemoji',
        animated: false,
        attachmentId: emojiAttachment.id,
        createdBy: alice.id,
      },
    });
  });

  afterAll(async () => {
    for (const socket of sockets) socket.disconnect();
    const users = await prisma.user.findMany({
      where: { email: { in: emails } },
      select: { id: true },
    });
    const ids = [...users.map((row) => row.id), ...partners, u2, u11].filter(Boolean);
    await prisma.message.deleteMany({ where: { authorId: { in: ids } } });
    await prisma.customEmoji.deleteMany({ where: { serverId } });
    await prisma.attachment.deleteMany({ where: { id: { in: attachmentIds } } });
    if (dmChannelIds.length > 0) {
      await prisma.channel.deleteMany({ where: { id: { in: dmChannelIds } } });
    }
    await prisma.server.deleteMany({ where: { ownerId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    const storage = app.get(LocalStorage);
    for (const id of attachmentIds) {
      for (const suffix of ['raw', 'ready', 'thumb']) await storage.remove(`${id}.${suffix}`);
    }
    await app.close();
  });

  it('không chung server → 403 DM_BLOCKED (chống dò nguyên nhân)', async () => {
    const res = await api('post', '/api/v1/dms', dave.token).send({ userId: alice.id }).expect(403);
    expect(res.body.code).toBe(ErrorCodes.DM_BLOCKED);
  });

  it('tạo DM idempotent: hai POST tuần tự → cùng channelId, GET /dms liệt kê', async () => {
    const first = await api('post', '/api/v1/dms', alice.token)
      .send({ userId: bob.id })
      .expect(200);
    dmId = first.body.channelId;
    dmChannelIds.push(dmId);
    expect(first.body.partner).toMatchObject({ id: bob.id });
    expect(first.body.unreadCount).toBe(0);

    const second = await api('post', '/api/v1/dms', bob.token)
      .send({ userId: alice.id })
      .expect(200);
    expect(second.body.channelId).toBe(dmId);

    const list = await api('get', '/api/v1/dms', alice.token).expect(200);
    const row = (list.body.dms as Array<{ channelId: string; partner: { id: string } }>).find(
      (item) => item.channelId === dmId,
    );
    expect(row?.partner.id).toBe(bob.id);
  });

  it('hai request SONG SONG cùng cặp mới → vẫn đúng MỘT channel (unique dmKey)', async () => {
    const [r1, r2] = await Promise.all([
      api('post', '/api/v1/dms', bob.token).send({ userId: u1 }).expect(200),
      api('post', '/api/v1/dms', bob.token).send({ userId: u1 }).expect(200),
    ]);
    dmChannelIds.push(r1.body.channelId);
    expect(r2.body.channelId).toBe(r1.body.channelId);
    const channels = await prisma.channel.findMany({
      where: { dmKey: `${[bob.id, u1].sort().join('|')}` },
      select: { id: true, type: true, serverId: true, name: true },
    });
    expect(channels).toHaveLength(1);
    expect(channels[0]).toMatchObject({ type: 'DM', serverId: null, name: '' });
  });

  it("target dmAllow='none' → 403 DM_BLOCKED", async () => {
    await prisma.user.update({ where: { id: u2 }, data: { dmAllow: 'none' } });
    const res = await api('post', '/api/v1/dms', alice.token).send({ userId: u2 }).expect(403);
    expect(res.body.code).toBe(ErrorCodes.DM_BLOCKED);
  });

  it('gửi tin text + GIF + attachment trong DM OK; sticker và token custom emoji bị chặn', async () => {
    const text = await api('post', `/api/v1/channels/${dmId}/messages`, alice.token)
      .send({ content: 'xin chào DM', nonce: randomUUID() })
      .expect(201);
    dmMessageId = text.body.id as string;

    await api('post', `/api/v1/channels/${dmId}/messages`, alice.token)
      .send({
        content: '',
        gif: {
          id: 'gif-1',
          url: 'https://media.tenor.com/abc/AAAAC/hello.gif',
          width: 120,
          height: 90,
        },
        nonce: randomUUID(),
      })
      .expect(201)
      .then((res) => expect(res.body.kind).toBe('gif'));

    dmAttachmentId = await readyAttachment(alice.token, dmId);
    await api('post', `/api/v1/channels/${dmId}/messages`, alice.token)
      .send({ content: '', attachmentIds: [dmAttachmentId], nonce: randomUUID() })
      .expect(201)
      .then((res) => expect(res.body.attachments[0]).toMatchObject({ id: dmAttachmentId }));

    // Bob gửi để dàn trải ngân sách rate-limit tin nhắn (10/10s/user/channel): attempt 400 cũng tính một slot.
    await api('post', `/api/v1/channels/${dmId}/messages`, bob.token)
      .send({ content: '', stickerId: randomUUID(), nonce: randomUUID() })
      .expect(400);

    const emoji = await prisma.customEmoji.findFirstOrThrow({
      where: { serverId, deletedAt: null },
      select: { id: true },
    });
    await api('post', `/api/v1/channels/${dmId}/messages`, bob.token)
      .send({ content: `:dmemoji:${emoji.id}`, nonce: randomUUID() })
      .expect(400);
  });

  it('block: DM mới 403, tin mới trong DM có sẵn 403, tin cũ đọc được, unblock gửi lại OK', async () => {
    await api('post', `/api/v1/users/${alice.id}/block`, bob.token).expect(204);

    const existing = await api('post', '/api/v1/dms', alice.token)
      .send({ userId: bob.id })
      .expect(200);
    expect(existing.body.channelId).toBe(dmId);

    const blocked = await api('post', `/api/v1/channels/${dmId}/messages`, alice.token)
      .send({ content: 'bị chặn rồi', nonce: randomUUID() })
      .expect(403);
    expect(blocked.body.code).toBe(ErrorCodes.DM_BLOCKED);

    const history = await api('get', `/api/v1/channels/${dmId}/messages`, alice.token).expect(200);
    expect(history.body.messages.length).toBeGreaterThan(0);

    await api('delete', `/api/v1/users/${alice.id}/block`, bob.token).expect(204);
    await api('delete', `/api/v1/users/${alice.id}/block`, bob.token).expect(204);
    await api('post', `/api/v1/channels/${dmId}/messages`, alice.token)
      .send({ content: 'gửi lại được rồi', nonce: randomUUID() })
      .expect(201);
  });

  it('block idempotent: chặn lại người đã chặn vẫn 204; tự block mình 400', async () => {
    await api('post', `/api/v1/users/${carol.id}/block`, alice.token).expect(204);
    await api('post', `/api/v1/users/${carol.id}/block`, alice.token).expect(204);
    await api('delete', `/api/v1/users/${carol.id}/block`, alice.token).expect(204);
    await api('post', `/api/v1/users/${alice.id}/block`, alice.token).expect(400);
  });

  it('unreadCount + markRead qua DmParticipant (cursor chỉ tiến)', async () => {
    const participantOf = (userId: string) =>
      prisma.dmParticipant.findUniqueOrThrow({
        where: { channelId_userId: { channelId: dmId, userId } },
        select: { lastReadMessageId: true },
      });
    const latestMessage = () =>
      prisma.message.findFirstOrThrow({
        where: { channelId: dmId, deletedAt: null },
        orderBy: { id: 'desc' },
        select: { id: true },
      });

    const before = await latestMessage();
    await api('put', `/api/v1/channels/${dmId}/read`, bob.token)
      .send({ messageId: before.id })
      .expect(204);
    expect((await participantOf(bob.id)).lastReadMessageId).toBe(before.id);

    for (const i of [1, 2, 3]) {
      await api('post', `/api/v1/channels/${dmId}/messages`, alice.token)
        .send({ content: `tin ${i}`, nonce: randomUUID() })
        .expect(201);
    }
    const list = await api('get', '/api/v1/dms', bob.token).expect(200);
    const row = (list.body.dms as Array<{ channelId: string; unreadCount: number }>).find(
      (item) => item.channelId === dmId,
    );
    expect(row?.unreadCount).toBe(3);

    const latest = await latestMessage();
    await api('put', `/api/v1/channels/${dmId}/read`, bob.token)
      .send({ messageId: latest.id })
      .expect(204);
    await api('put', `/api/v1/channels/${dmId}/read`, bob.token)
      .send({ messageId: before.id })
      .expect(204);
    const after = await participantOf(bob.id);
    expect(after.lastReadMessageId).toBe(latest.id);
    const listAfter = await api('get', '/api/v1/dms', bob.token).expect(200);
    const rowAfter = (listAfter.body.dms as Array<{ channelId: string; unreadCount: number }>).find(
      (item) => item.channelId === dmId,
    );
    expect(rowAfter?.unreadCount).toBe(0);
  });

  it('realtime: bob nhận message.created trong room DM; alice nhận channel.activity serverId=null; carol không join được và không nhận gì', async () => {
    const aliceSocket = await connectClient(alice.token);
    const bobSocket = await connectClient(bob.token);
    const carolSocket = await connectClient(carol.token);

    expect(await socketJoin(aliceSocket, dmId)).toEqual({ ok: true });
    expect(await socketJoin(bobSocket, dmId)).toEqual({ ok: true });
    const carolJoin = await socketJoin(carolSocket, dmId);
    expect(carolJoin.ok).toBe(false);

    const bobReceived = waitEvent<MessageCreatedPayload>(bobSocket, 'message.created');
    const bobActivity = waitEvent<ChannelActivityPayload>(bobSocket, 'channel.activity');
    const carolReceived = assertNoEvent(carolSocket, 'message.created', 1200);
    const aliceActivity = assertNoEvent(aliceSocket, 'channel.activity', 1200);

    await api('post', `/api/v1/channels/${dmId}/messages`, alice.token)
      .send({ content: 'realtime DM', nonce: randomUUID() })
      .expect(201);

    const created = await bobReceived;
    expect(created).toMatchObject({ channelId: dmId, authorId: alice.id, content: 'realtime DM' });
    expect(await bobActivity).toMatchObject({
      channelId: dmId,
      serverId: null,
      messageId: created.id,
      authorId: alice.id,
    });
    expect(await aliceActivity).toBe(false);
    expect(await carolReceived).toBe(false);

    const aliceActivity2 = waitEvent<ChannelActivityPayload>(aliceSocket, 'channel.activity');
    const aliceCreated = waitEvent<MessageCreatedPayload>(aliceSocket, 'message.created');
    const bobActivity2 = assertNoEvent(bobSocket, 'channel.activity', 1200);
    await api('post', `/api/v1/channels/${dmId}/messages`, bob.token)
      .send({ content: 'badge cho alice', nonce: randomUUID() })
      .expect(201);
    expect(await aliceCreated).toMatchObject({ authorId: bob.id });
    expect(await aliceActivity2).toMatchObject({
      channelId: dmId,
      serverId: null,
      authorId: bob.id,
    });
    expect(await bobActivity2).toBe(false);
  });

  it('IDOR người thứ ba (chung server, không phải participant): 404 mọi route DM', async () => {
    const list = await api('get', '/api/v1/dms', carol.token).expect(200);
    expect(
      (list.body.dms as Array<{ channelId: string }>).some((item) => item.channelId === dmId),
    ).toBe(false);

    await api('get', `/api/v1/channels/${dmId}/messages`, carol.token).expect(404);
    await api('post', `/api/v1/channels/${dmId}/messages`, carol.token)
      .send({ content: 'intruder', nonce: randomUUID() })
      .expect(404);
    await api('patch', `/api/v1/messages/${dmMessageId}`, carol.token)
      .send({ content: 'hacked' })
      .expect(404);
    await api('put', `/api/v1/channels/${dmId}/read`, carol.token)
      .send({ messageId: dmMessageId })
      .expect(404);
    await api('get', `/api/v1/channels/${dmId}/pins`, carol.token).expect(404);
    await api('put', `/api/v1/messages/${dmMessageId}/pin`, carol.token).expect(404);
    await api(
      'put',
      `/api/v1/messages/${dmMessageId}/reactions/${encodeURIComponent('👍')}`,
      carol.token,
    ).expect(404);

    await api('get', `/api/v1/attachments/${dmAttachmentId}/download`, carol.token).expect(404);
    await api('get', `/api/v1/attachments/${dmAttachmentId}/download`, alice.token).expect(200);
  });

  it('pin + reaction hoạt động như tin thường giữa hai participant', async () => {
    const pinned = await api('put', `/api/v1/messages/${dmMessageId}/pin`, alice.token).expect(200);
    expect(pinned.body.messageId).toBe(dmMessageId);
    await api('get', `/api/v1/channels/${dmId}/pins`, bob.token)
      .expect(200)
      .then((res) =>
        expect(
          res.body.some((pin: { message: { id: string } }) => pin.message.id === dmMessageId),
        ).toBe(true),
      );
    await api(
      'put',
      `/api/v1/messages/${dmMessageId}/reactions/${encodeURIComponent('👍')}`,
      bob.token,
    ).expect(200);
  });

  it('trần 10 DM mới/giờ: DM thứ 11 → 429', async () => {
    for (const partner of partners) {
      const res = await api('post', '/api/v1/dms', spammer.token)
        .send({ userId: partner })
        .expect(200);
      dmChannelIds.push(res.body.channelId);
    }
    await api('post', '/api/v1/dms', spammer.token).send({ userId: partners[0] }).expect(200);
    const res = await api('post', '/api/v1/dms', spammer.token).send({ userId: u11 }).expect(429);
    expect(res.body.code).toBe(ErrorCodes.TOO_MANY_REQUESTS);
    expect(res.headers['retry-after']).toBeDefined();
  });

  it('DM không vào index AI (syncMessage bỏ qua serverId NULL), tin server thì có', async () => {
    const serverMessage = await api(
      'post',
      `/api/v1/channels/${serverGeneral}/messages`,
      alice.token,
    )
      .send({ content: 'tin server để index', nonce: randomUUID() })
      .expect(201);

    class RecordingStore implements VectorStore {
      readonly upserts: { collection: string; points: readonly VectorPoint[] }[] = [];
      async ensureCollection(): Promise<void> {}
      async upsert(collection: string, points: readonly VectorPoint[]): Promise<void> {
        this.upserts.push({ collection, points });
      }
      async deleteByMessageIds(): Promise<void> {}
      async search(): Promise<VectorSearchHit[]> {
        return [];
      }
      async count(): Promise<number> {
        return 0;
      }
      async deleteCollection(): Promise<void> {}
      async health(): Promise<boolean> {
        return true;
      }
    }
    const store = new RecordingStore();
    const core = new MessageIndexerCore(prisma, new FakeEmbedder(4), store, {
      windowSize: 4,
      maxTokens: 10_000,
    });

    await core.syncMessage(serverMessage.body.id as string);
    expect(store.upserts).toHaveLength(1);
    expect(store.upserts[0]!.points[0]!.payload.serverId).toBe(serverId);

    const before = store.upserts.length;
    await core.syncMessage(dmMessageId);
    expect(store.upserts).toHaveLength(before);
  });
});
