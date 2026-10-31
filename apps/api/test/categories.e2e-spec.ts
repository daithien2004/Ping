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

/** Chờ client nhận đúng một event — timeout làm test treo rõ ràng thay vì im lặng. */
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

/**
 * TG.10 category + sắp xếp + topic (e2e). Boot kèm websocket để kiểm event
 * `channel.reordered` thật. Các spec e2e chạy tuần tự (fileParallelism: false) — dùng chung
 * Postgres/Redis thật. Thứ tự trong GET detail là hợp đồng của web: vùng mặc định (position
 * Int) trước, rồi từng category theo position lexorank, kênh trong category theo positionKey.
 */
describe('Categories, channel ordering & topic (TG.10, e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const emails: string[] = [];

  let owner: TestUser; // chủ server A — có MANAGE_CHANNELS (owner)
  let plain: TestUser; // member thường chỉ @everyone → 403 mọi thao tác category
  let outsider: TestUser; // chủ server B (IDOR + category chéo server)
  let partner: TestUser; // đối tác DM của plain (kiểm DM không có category)
  let serverA = '';
  let serverB = '';
  let dmChannel = '';
  const channels: Record<string, string> = {}; // tên → id (general, ch2, ch3, ch4)
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

  /** Channel trong GET detail — map id → thứ tự hiển thị. */
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
    // websocket: true — gắn RedisIoAdapter để kiểm event channel.reordered thật.
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
    // partner cũng vào A: POST /dms đòi hai người CHUNG server (ADR-0070) — DM chỉ dùng để
    // kiểm channel serverId NULL không có category.
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

    // DM giữa plain và partner (TG.9): serverId NULL — không được phép có category.
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
    // beforeAll lỗi trước khi tạo DM → dmChannel rỗng; đừng che mất lỗi gốc bằng crash dọn dẹp.
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
    // Chưa kênh nào vào category: toàn bộ ở vùng mặc định, đúng thứ tự position cũ.
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
    // Rank gán lại tăng theo mảng mới.
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

    // Idempotent: PUT cùng thứ tự lần nữa → cùng position, không ghi thêm audit.
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
    // ch2 vào catA (không positionKey) → là kênh duy nhất của nhóm.
    await api('put', `/api/v1/channels/${channels.ch2}/move`, owner.token)
      .send({ categoryId: catA })
      .expect(200);
    let detail = await detailOrder(owner.token);
    expect(detail.channels.find((c) => c.id === channels.ch2)).toMatchObject({
      categoryId: catA,
      positionKey: 'm',
    });
    // Thứ tự hiển thị: vùng mặc định (general, ch3, ch4) trước, rồi kênh của catA.
    expect(detail.channels.map((channel) => channel.id)).toEqual([
      channels.general,
      channels.ch3,
      channels.ch4,
      channels.ch2,
    ]);

    // ch3 vào catA VỚI positionKey tính bằng rankBetween (như UI kéo thả) → đứng TRƯỚC ch2.
    const positionKey = rankBetween(undefined, 'm');
    expect(positionKey).not.toBeNull();
    await api('put', `/api/v1/channels/${channels.ch3}/move`, owner.token)
      .send({ categoryId: catA, positionKey })
      .expect(200);
    detail = await detailOrder(owner.token);
    // Vùng mặc định còn general + ch4 (2 kênh) — kênh của catA bắt đầu từ chỉ số 2.
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
    // Vùng mặc định còn general (1 kênh) — kênh của catA bắt đầu từ chỉ số 1.
    expect(detail.channels.slice(1).map((channel) => channel.id)).toEqual([
      channels.ch3,
      channels.ch2,
      channels.ch4,
    ]);
    // Rank của ch4 > rank của ch2 (kênh cuối trước đó).
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

    // Chuỗi rỗng = xóa topic (lưu null).
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

    // DM: người ngoài không phải participant → 404 che tồn tại.
    await api('put', `/api/v1/channels/${dmChannel}/move`, outsider.token)
      .send({ categoryId: null })
      .expect(404);
    // Participant hợp lệ nhưng DM không có `manage Channel` (defineDmAbilityFor) → 403.
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

    // Category của server B gắn vào route server A: guard qua (owner B hợp lệ) nhưng service
    // tra category theo serverId → 404 che tồn tại.
    const catB1 = (
      await api('post', `/api/v1/servers/${serverB}/categories`, outsider.token)
        .send({ name: 'B-cat' })
        .expect(201)
    ).body.id;
    await api('put', `/api/v1/channels/${channels.general}/move`, owner.token)
      .send({ categoryId: catB1 })
      .expect(404);
    // Chưa có gì thay đổi ở server A.
    const detail = await detailOrder(owner.token);
    expect(
      detail.channels.find((channel) => channel.id === channels.general)?.categoryId,
    ).toBeNull();
  });

  it('(g) xóa category → kênh về vùng mặc định (giữ nguyên, không mất kênh)', async () => {
    // Đổi tên catA trước để kiểm rename hoạt động cạnh các thao tác khác.
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
    expect(detail.categories).toEqual([catC, catB]); // thứ tự sau reorder (b) giữ nguyên
    expect(detail.channels.map((channel) => channel.id)).toEqual([
      channels.general,
      channels.ch2,
      channels.ch3,
      channels.ch4,
    ]);
    expect(detail.channels.every((channel) => channel.categoryId === null)).toBe(true);
    expect(detail.channels.every((channel) => channel.positionKey === null)).toBe(true);
    // Position Int cũ không đụng: thứ tự trong vùng mặc định vẫn là thứ tự tạo channel.
    expect(detail.channels.map((channel) => channel.position)).toEqual([0, 1, 2, 3]);
  });

  it('(h) realtime channel.reordered: scope categories khi reorder, scope category khi move', async () => {
    const socket = await connectClient(app, owner.token);
    await new Promise((resolve) => setTimeout(resolve, 250));

    const categoriesPromise = waitEvent<ChannelReorderedPayload>(socket, 'channel.reordered');
    await api('put', `/api/v1/servers/${serverA}/categories/reorder`, owner.token)
      .send({ orderedIds: [catB, catC] })
      .expect(200);
    // Scope 'categories': mảng là các CATEGORYID theo thứ tự mới.
    expect(await categoriesPromise).toEqual({
      serverId: serverA,
      scope: 'categories',
      channelIds: [catB, catC],
    });

    const movePromise = waitEvent<ChannelReorderedPayload>(socket, 'channel.reordered');
    await api('put', `/api/v1/channels/${channels.ch2}/move`, owner.token)
      .send({ categoryId: catB })
      .expect(200);
    // Scope 'category': categoryId là nhóm đích, mảng là CHANNELID theo thứ tự mới.
    const movePayload = await movePromise;
    expect(movePayload).toEqual({
      serverId: serverA,
      scope: 'category',
      categoryId: catB,
      channelIds: [channels.ch2],
    });

    // Move về vùng mặc định: scope 'category' với categoryId null.
    const toDefaultPromise = waitEvent<ChannelReorderedPayload>(socket, 'channel.reordered');
    await api('put', `/api/v1/channels/${channels.ch2}/move`, owner.token)
      .send({ categoryId: null })
      .expect(200);
    const toDefault = await toDefaultPromise;
    expect(toDefault.scope).toBe('category');
    expect(toDefault.categoryId).toBeNull();
    expect(toDefault.channelIds).toContain(channels.ch2);

    // Xóa category → scope 'categories' với danh sách còn lại.
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
    // (h) đã xoá catB nên chỉ còn catC — tạo thêm một category để phép "thiếu id" có nghĩa.
    await api('post', `/api/v1/servers/${serverA}/categories`, owner.token)
      .send({ name: 'Còn lại' })
      .expect(201);
    await api('put', `/api/v1/servers/${serverA}/categories/reorder`, owner.token)
      .send({ orderedIds: [catC] })
      .expect(400); // thiếu category khác
    await api('put', `/api/v1/servers/${serverA}/categories/reorder`, owner.token)
      .send({ orderedIds: [catC, randomUUID()] })
      .expect(400); // id không tồn tại
    await api('put', `/api/v1/channels/${channels.ch3}/move`, owner.token)
      .send({ categoryId: catC, positionKey: 'ABC' })
      .expect(400); // chỉ a-z
    await api('put', `/api/v1/channels/${channels.ch3}/move`, owner.token)
      .send({ categoryId: catC, positionKey: 'x'.repeat(65) })
      .expect(400);
    await api('put', `/api/v1/channels/${channels.ch3}/move`, owner.token)
      .send({ categoryId: 'not-a-uuid' })
      .expect(400);
    // Topic 200 ký tự là biên hợp lệ.
    await api('patch', `/api/v1/channels/${channels.general}/topic`, owner.token)
      .send({ topic: 'x'.repeat(200) })
      .expect(200);
  });
});
