import type { INestApplication } from '@nestjs/common';
import { rankBetween, type ChannelReorderedPayload } from '@ping/shared';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { io, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { RedisProvider } from '../src/infra/redis/redis.module.js';
import { bootApp } from './helpers/boot.js';

const runId = Date.now().toString(36);

interface TestUser {
  id: string;
  token: string;
}

type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';

function waitEvent<T>(socket: Socket, event: string, timeoutMs = 3000): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, handler);
      reject(new Error(`Timeout: client không nhận được event "${event}"`));
    }, timeoutMs);
    const handler = (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    };
    socket.once(event, handler);
  });
}

const sockets: Socket[] = [];

function connectClient(app: INestApplication, token: string): Promise<Socket> {
  const address = app.getHttpServer().address();
  const port = typeof address === 'object' && address !== null ? address.port : 0;
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

describe('Categories, channel ordering & topic (TG.10, e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const emails: string[] = [];

  let owner: TestUser;
  let plain: TestUser;
  let outsider: TestUser;
  let partner: TestUser;
  let serverA = '';
  let serverB = '';
  let dmChannel = '';
  const channels: Record<string, string> = {};
  let catA = '';
  let catB = '';
  let catC = '';

  async function registerUser(label: string): Promise<TestUser> {
    const email = `cat-${label}-${runId}@ping.dev`;
    emails.push(email);
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, username: `c${label}${runId}`.slice(0, 32), password: 'password123' })
      .expect(201);
    return { id: res.body.user.id, token: res.body.accessToken };
  }

  function api(method: HttpMethod, url: string, token: string) {
    return request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token}`);
  }

  async function detailOrder(token: string) {
    const res = await api('get', `/api/v1/servers/${serverA}`, token).expect(200);
    return {
      categories: (
        res.body.categories as Array<{ id: string; name: string; position: string }>
      ).map((category) => category.id),
      channels: res.body.channels as Array<{
        id: string;
        name: string;
        categoryId: string | null;
        positionKey: string | null;
        topic: string | null;
        position: number;
      }>,
      raw: res.body,
    };
  }

  beforeAll(async () => {
    app = await bootApp({ websocket: true });
    await app.get(RedisProvider).flushdb();
    prisma = app.get(PrismaService);

    [owner, plain, outsider, partner] = [
      await registerUser('o'),
      await registerUser('p'),
      await registerUser('x'),
      await registerUser('m'),
    ];

    const a = await api('post', '/api/v1/servers', owner.token).send({ name: 'A' }).expect(201);
    serverA = a.body.id;
    channels.general = a.body.channels[0].id;
    await api('post', '/api/v1/servers/join', plain.token)
      .send({ inviteCode: a.body.inviteCode })
      .expect(201);
    await api('post', '/api/v1/servers/join', partner.token)
      .send({ inviteCode: a.body.inviteCode })
      .expect(201);
    for (const name of ['ch2', 'ch3', 'ch4']) {
      channels[name] = (
        await api('post', `/api/v1/servers/${serverA}/channels`, owner.token)
          .send({ name })
          .expect(201)
      ).body.id;
    }

    const b = await api('post', '/api/v1/servers', outsider.token).send({ name: 'B' }).expect(201);
    serverB = b.body.id;

    dmChannel = (
      await api('post', '/api/v1/dms', plain.token).send({ userId: partner.id }).expect(200)
    ).body.channelId;
  }, 30000);

  afterAll(async () => {
    for (const socket of sockets) socket.disconnect();
    const users = await prisma.user.findMany({
      where: { email: { in: emails } },
      select: { id: true },
    });
    const userIds = users.map((user) => user.id);
    await prisma.auditLog.deleteMany({ where: { serverId: { in: [serverA, serverB] } } });
    if (dmChannel) await prisma.channel.deleteMany({ where: { id: dmChannel } });
    await prisma.server.deleteMany({ where: { ownerId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it('(a) tạo 3 category → GET detail đúng thứ tự tạo (lexorank tăng)', async () => {
    const created = [];
    for (const name of ['Văn bản', 'Hỗ trợ', 'Nhàn rỗi']) {
      created.push(
        (
          await api('post', `/api/v1/servers/${serverA}/categories`, owner.token)
            .send({ name })
            .expect(201)
        ).body as { id: string; name: string; position: string },
      );
    }
    [catA, catB, catC] = created.map((category) => category.id);
    expect(created.map((category) => category.position)).toEqual(['m', 'n', 'o']);

    const detail = await detailOrder(owner.token);
    expect(detail.categories).toEqual([catA, catB, catC]);
    expect(detail.channels.map((channel) => channel.id)).toEqual([
      channels.general,
      channels.ch2,
      channels.ch3,
      channels.ch4,
    ]);
    expect(detail.channels.every((channel) => channel.categoryId === null)).toBe(true);
  });

  it('(b) reorder đổi thứ tự → GET khớp, audit CHANNEL_REORDER, gọi lại lần nữa không đổi gì', async () => {
    const newOrder = [catC, catA, catB];
    const res = await api('put', `/api/v1/servers/${serverA}/categories/reorder`, owner.token)
      .send({ orderedIds: newOrder })
      .expect(200);
    expect(res.body.map((category: { id: string }) => category.id)).toEqual(newOrder);
    const positions = res.body.map((category: { position: string }) => category.position);
    expect(positions[0]! < positions[1]!).toBe(true);
    expect(positions[1]! < positions[2]!).toBe(true);

    expect((await detailOrder(owner.token)).categories).toEqual(newOrder);
    expect(
      await prisma.auditLog.findMany({
        where: { serverId: serverA, action: 'CHANNEL_REORDER' },
      }),
    ).toEqual([
      expect.objectContaining({
        actorId: owner.id,
        metadata: { categoryIds: newOrder },
      }),
    ]);

    const again = await api('put', `/api/v1/servers/${serverA}/categories/reorder`, owner.token)
      .send({ orderedIds: newOrder })
      .expect(200);
    expect(again.body.map((category: { position: string }) => category.position)).toEqual(
      positions,
    );
    expect(
      await prisma.auditLog.count({ where: { serverId: serverA, action: 'CHANNEL_REORDER' } }),
    ).toBe(1);
  });

  it('(c) move vào category: không positionKey → cuối; positionKey từ UI → đúng vị trí', async () => {
    await api('put', `/api/v1/channels/${channels.ch2}/move`, owner.token)
      .send({ categoryId: catA })
      .expect(200);
    let detail = await detailOrder(owner.token);
    expect(detail.channels.find((c) => c.id === channels.ch2)).toMatchObject({
      categoryId: catA,
      positionKey: 'm',
    });
    expect(detail.channels.map((channel) => channel.id)).toEqual([
      channels.general,
      channels.ch3,
      channels.ch4,
      channels.ch2,
    ]);

    const positionKey = rankBetween(undefined, 'm');
    expect(positionKey).not.toBeNull();
    await api('put', `/api/v1/channels/${channels.ch3}/move`, owner.token)
      .send({ categoryId: catA, positionKey })
      .expect(200);
    detail = await detailOrder(owner.token);
    expect(detail.channels.slice(2).map((channel) => channel.id)).toEqual([
      channels.ch3,
      channels.ch2,
    ]);
  });

  it('(d) move không positionKey vào category có sẵn → nối CUỐI nhóm', async () => {
    await api('put', `/api/v1/channels/${channels.ch4}/move`, owner.token)
      .send({ categoryId: catA })
      .expect(200);
    const detail = await detailOrder(owner.token);
    expect(detail.channels.slice(1).map((channel) => channel.id)).toEqual([
      channels.ch3,
      channels.ch2,
      channels.ch4,
    ]);
    const byId = new Map(detail.channels.map((channel) => [channel.id, channel]));
    expect(byId.get(channels.ch4)!.positionKey! > byId.get(channels.ch2)!.positionKey!).toBe(true);
  });

  it('(e) topic: đặt → detail có topic + channel.updated; chuỗi rỗng → xóa; >200 ký tự → 400', async () => {
    const socket = await connectClient(app, owner.token);
    await new Promise((resolve) => setTimeout(resolve, 250));
    const updatedPromise = waitEvent<{ id: string; topic: string | null }>(
      socket,
      'channel.updated',
    );

    await api('patch', `/api/v1/channels/${channels.general}/topic`, owner.token)
      .send({ topic: 'Kênh chung của server' })
      .expect(200);
    expect(await updatedPromise).toMatchObject({
      id: channels.general,
      topic: 'Kênh chung của server',
    });

    let detail = await detailOrder(owner.token);
    expect(detail.channels.find((channel) => channel.id === channels.general)?.topic).toBe(
      'Kênh chung của server',
    );

    await api('patch', `/api/v1/channels/${channels.general}/topic`, owner.token)
      .send({ topic: '' })
      .expect(200);
    detail = await detailOrder(owner.token);
    expect(detail.channels.find((channel) => channel.id === channels.general)?.topic).toBeNull();
    socket.disconnect();

    await api('patch', `/api/v1/channels/${channels.general}/topic`, owner.token)
      .send({ topic: 'x'.repeat(201) })
      .expect(400);
  });

  it('(f) member thường 403 mọi thao tác category/move/topic; DM không có category', async () => {
    await api('post', `/api/v1/servers/${serverA}/categories`, plain.token)
      .send({ name: 'x' })
      .expect(403);
    await api('put', `/api/v1/servers/${serverA}/categories/reorder`, plain.token)
      .send({ orderedIds: [catC, catA, catB] })
      .expect(403);
    await api('patch', `/api/v1/servers/${serverA}/categories/${catA}`, plain.token)
      .send({ name: 'x' })
      .expect(403);
    await api('delete', `/api/v1/servers/${serverA}/categories/${catA}`, plain.token).expect(403);
    await api('put', `/api/v1/channels/${channels.general}/move`, plain.token)
      .send({ categoryId: catA })
      .expect(403);
    await api('patch', `/api/v1/channels/${channels.general}/topic`, plain.token)
      .send({ topic: 'hacked' })
      .expect(403);

    await api('put', `/api/v1/channels/${dmChannel}/move`, outsider.token)
      .send({ categoryId: null })
      .expect(404);
    await api('put', `/api/v1/channels/${dmChannel}/move`, plain.token)
      .send({ categoryId: null })
      .expect(403);
    await api('patch', `/api/v1/channels/${dmChannel}/topic`, plain.token)
      .send({ topic: 'dm topic' })
      .expect(403);
  });

  it('IDOR: chủ server khác không đụng được category của A; category chéo server → 404', async () => {
    await api('post', `/api/v1/servers/${serverA}/categories`, outsider.token)
      .send({ name: 'x' })
      .expect(403);
    await api('patch', `/api/v1/servers/${serverA}/categories/${catA}`, outsider.token)
      .send({ name: 'x' })
      .expect(403);
    await api('delete', `/api/v1/servers/${serverA}/categories/${catA}`, outsider.token).expect(
      403,
    );
    await api('put', `/api/v1/servers/${serverA}/categories/reorder`, outsider.token)
      .send({ orderedIds: [catA, catB, catC] })
      .expect(403);
    await api('put', `/api/v1/channels/${channels.general}/move`, outsider.token)
      .send({ categoryId: catA })
      .expect(403);

    const catB1 = (
      await api('post', `/api/v1/servers/${serverB}/categories`, outsider.token)
        .send({ name: 'B-cat' })
        .expect(201)
    ).body.id;
    await api('put', `/api/v1/channels/${channels.general}/move`, owner.token)
      .send({ categoryId: catB1 })
      .expect(404);
    const detail = await detailOrder(owner.token);
    expect(
      detail.channels.find((channel) => channel.id === channels.general)?.categoryId,
    ).toBeNull();
  });

  it('(g) xóa category → kênh về vùng mặc định (giữ nguyên, không mất kênh)', async () => {
    await api('patch', `/api/v1/servers/${serverA}/categories/${catA}`, owner.token)
      .send({ name: 'Đã giải tán' })
      .expect(200);

    const res = await api(
      'delete',
      `/api/v1/servers/${serverA}/categories/${catA}`,
      owner.token,
    ).expect(200);
    expect(res.body).toEqual({ id: catA });

    const detail = await detailOrder(owner.token);
    expect(detail.categories).toEqual([catC, catB]);
    expect(detail.channels.map((channel) => channel.id)).toEqual([
      channels.general,
      channels.ch2,
      channels.ch3,
      channels.ch4,
    ]);
    expect(detail.channels.every((channel) => channel.categoryId === null)).toBe(true);
    expect(detail.channels.every((channel) => channel.positionKey === null)).toBe(true);
    expect(detail.channels.map((channel) => channel.position)).toEqual([0, 1, 2, 3]);
  });

  it('(h) realtime channel.reordered: scope categories khi reorder, scope category khi move', async () => {
    const socket = await connectClient(app, owner.token);
    await new Promise((resolve) => setTimeout(resolve, 250));

    const categoriesPromise = waitEvent<ChannelReorderedPayload>(socket, 'channel.reordered');
    await api('put', `/api/v1/servers/${serverA}/categories/reorder`, owner.token)
      .send({ orderedIds: [catB, catC] })
      .expect(200);
    expect(await categoriesPromise).toEqual({
      serverId: serverA,
      scope: 'categories',
      channelIds: [catB, catC],
    });

    const movePromise = waitEvent<ChannelReorderedPayload>(socket, 'channel.reordered');
    await api('put', `/api/v1/channels/${channels.ch2}/move`, owner.token)
      .send({ categoryId: catB })
      .expect(200);
    const movePayload = await movePromise;
    expect(movePayload).toEqual({
      serverId: serverA,
      scope: 'category',
      categoryId: catB,
      channelIds: [channels.ch2],
    });

    const toDefaultPromise = waitEvent<ChannelReorderedPayload>(socket, 'channel.reordered');
    await api('put', `/api/v1/channels/${channels.ch2}/move`, owner.token)
      .send({ categoryId: null })
      .expect(200);
    const toDefault = await toDefaultPromise;
    expect(toDefault.scope).toBe('category');
    expect(toDefault.categoryId).toBeNull();
    expect(toDefault.channelIds).toContain(channels.ch2);

    const deletePromise = waitEvent<ChannelReorderedPayload>(socket, 'channel.reordered');
    await api('delete', `/api/v1/servers/${serverA}/categories/${catB}`, owner.token).expect(200);
    expect(await deletePromise).toEqual({
      serverId: serverA,
      scope: 'categories',
      channelIds: [catC],
    });
    socket.disconnect();
  });

  it('validate: tên rỗng/quá dài → 400; orderedIds thiếu id → 400; positionKey sai hình thức → 400', async () => {
    await api('post', `/api/v1/servers/${serverA}/categories`, owner.token)
      .send({ name: '' })
      .expect(400);
    await api('post', `/api/v1/servers/${serverA}/categories`, owner.token)
      .send({ name: 'x'.repeat(51) })
      .expect(400);
    await api('post', `/api/v1/servers/${serverA}/categories`, owner.token)
      .send({ name: 'Còn lại' })
      .expect(201);
    await api('put', `/api/v1/servers/${serverA}/categories/reorder`, owner.token)
      .send({ orderedIds: [catC] })
      .expect(400);
    await api('put', `/api/v1/servers/${serverA}/categories/reorder`, owner.token)
      .send({ orderedIds: [catC, randomUUID()] })
      .expect(400);
    await api('put', `/api/v1/channels/${channels.ch3}/move`, owner.token)
      .send({ categoryId: catC, positionKey: 'ABC' })
      .expect(400);
    await api('put', `/api/v1/channels/${channels.ch3}/move`, owner.token)
      .send({ categoryId: catC, positionKey: 'x'.repeat(65) })
      .expect(400);
    await api('put', `/api/v1/channels/${channels.ch3}/move`, owner.token)
      .send({ categoryId: 'not-a-uuid' })
      .expect(400);
    await api('patch', `/api/v1/channels/${channels.general}/topic`, owner.token)
      .send({ topic: 'x'.repeat(200) })
      .expect(200);
  });
});
