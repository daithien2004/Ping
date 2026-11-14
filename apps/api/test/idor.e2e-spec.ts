import { RequestMethod, type INestApplication } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants.js';
import { ModulesContainer } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { RedisProvider } from '../src/infra/redis/redis.module.js';
import { bootApp } from './helpers/boot.js';

const runId = Date.now().toString(36);

type Verb = 'get' | 'post' | 'patch' | 'put' | 'delete';

const ID_ROUTES: Array<[Verb, string]> = [
  ['get', '/servers/:id'],
  ['patch', '/servers/:id'],
  ['get', '/servers/:id/me/permissions'],
  ['get', '/servers/:id/members'],
  ['patch', '/servers/:id/members/me'],
  ['post', '/servers/:id/leave'],
  ['delete', '/servers/:id/members/:id'],
  ['post', '/servers/:id/bans'],
  ['get', '/servers/:id/bans'],
  ['delete', '/servers/:id/bans/:id'],
  ['delete', '/servers/:id'],
  ['get', '/servers/:id/channels'],
  ['post', '/servers/:id/channels'],
  ['patch', '/channels/:id'],
  ['delete', '/channels/:id'],
  ['post', '/servers/:id/categories'],
  ['patch', '/servers/:id/categories/:id'],
  ['delete', '/servers/:id/categories/:id'],
  ['put', '/servers/:id/categories/reorder'],
  ['put', '/channels/:id/move'],
  ['patch', '/channels/:id/topic'],
  ['get', '/servers/:id/roles'],
  ['post', '/servers/:id/roles'],
  ['get', '/servers/:id/audit-log'],
  ['put', '/servers/:id/members/:id/roles'],
  ['patch', '/roles/:id'],
  ['delete', '/roles/:id'],
  ['post', '/servers/:id/invite/regenerate'],
  ['get', '/servers/:id/search'],
  ['get', '/channels/:id/messages'],
  ['post', '/channels/:id/messages'],
  ['put', '/channels/:id/read'],
  ['get', '/servers/:id/unread'],
  ['patch', '/messages/:id'],
  ['delete', '/messages/:id'],
  ['get', '/messages/:id/reactions/:emoji'],
  ['put', '/messages/:id/reactions/:emoji'],
  ['delete', '/messages/:id/reactions/:emoji'],
  ['get', '/channels/:id/pins'],
  ['put', '/messages/:id/pin'],
  ['delete', '/messages/:id/pin'],
  ['post', '/servers/:id/ask'],
  ['put', '/uploads/:id/content'],
  ['post', '/uploads/:id/complete'],
  ['get', '/uploads/:id'],
  ['delete', '/uploads/:id'],
  ['get', '/attachments/:id/download'],
  ['get', '/attachments/:id/file'],
  ['post', '/servers/:id/stickers'],
  ['get', '/servers/:id/stickers'],
  ['delete', '/stickers/:id'],
  ['post', '/servers/:id/emojis'],
  ['get', '/servers/:id/emojis'],
  ['delete', '/emojis/:id'],
  ['delete', '/users/me/sessions/:id'],
  // POST/GET /dms không nằm ở đây: route không có id trong path nên test phủ route không bắt; IDOR của DM phủ ở dms.e2e-spec.
  ['post', '/users/:id/block'],
  ['delete', '/users/:id/block'],
  ['put', '/users/me/notification-prefs/server/:id'],
  ['put', '/users/me/notification-prefs/channel/:id'],
  ['delete', '/users/me/notification-prefs/server/:id'],
  ['delete', '/users/me/notification-prefs/channel/:id'],
];

function discoverIdRoutes(app: INestApplication): string[] {
  const found: string[] = [];
  for (const module of app.get(ModulesContainer).values()) {
    for (const wrapper of module.controllers.values()) {
      const controller = wrapper.metatype as (new (...args: never[]) => object) | null;
      if (!controller) continue;
      const base = Reflect.getMetadata(PATH_METADATA, controller) as string | string[] | undefined;
      for (const name of Object.getOwnPropertyNames(controller.prototype)) {
        const handler = (controller.prototype as Record<string, unknown>)[name];
        if (typeof handler !== 'function') continue;
        const method = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod | undefined;
        if (method === undefined) continue;
        const path = Reflect.getMetadata(PATH_METADATA, handler) as string | string[] | undefined;
        const full = `/${[base, path].flat().filter(Boolean).join('/')}`
          .replace(/\/+/g, '/')
          .replace(/\/$/, '');
        const normalized = full.replace(/:[A-Za-z]*Id/g, ':id');
        if (normalized.includes(':id')) {
          found.push(`${RequestMethod[method]!.toLowerCase()} ${normalized}`);
        }
      }
    }
  }
  return found.sort();
}

interface Actor {
  id: string;
  token: string;
  email: string;
}

describe('IDOR (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const emails: string[] = [];

  let alice: Actor;
  let carol: Actor;
  let bob: Actor;
  let dan: Actor;
  let serverA = '';
  let serverB = '';
  let channelA = '';
  let roleA = '';
  let aliceMemberA = '';
  let carolMemberA = '';
  let bobMemberB = '';
  let aliceMessage = '';
  let carolMessage = '';
  let uploadId = '';
  let aliceSession = '';
  let stickerA = '';
  let stickerPackA = '';
  let emojiA = '';
  let categoryA = '';

  const SECRET = `secret-${runId}`;
  const http = () => request(app.getHttpServer());

  async function register(label: string): Promise<Actor> {
    const email = `idor-${label}-${runId}@ping.dev`;
    emails.push(email);
    const res = await http()
      .post('/api/v1/auth/register')
      .send({ email, username: `i${label}${runId}`.slice(0, 32), password: 'password123' })
      .expect(201);
    return { id: res.body.user.id, token: res.body.accessToken, email };
  }
  const as = (
    actor: Actor | undefined,
    method: 'get' | 'post' | 'patch' | 'put' | 'delete',
    url: string,
  ) => {
    const call = http()[method](`/api/v1${url}`);
    return actor ? call.set('Authorization', `Bearer ${actor.token}`) : call;
  };

  async function snapshotA() {
    const [
      server,
      members,
      roles,
      channels,
      messages,
      memberRoles,
      carolSessions,
      emojis,
      categories,
    ] = await Promise.all([
      prisma.server.findUnique({ where: { id: serverA } }),
      prisma.member.findMany({ where: { serverId: serverA }, orderBy: { id: 'asc' } }),
      prisma.role.findMany({ where: { serverId: serverA }, orderBy: { id: 'asc' } }),
      prisma.channel.findMany({ where: { serverId: serverA }, orderBy: { id: 'asc' } }),
      prisma.message.findMany({
        where: { channel: { serverId: serverA } },
        orderBy: { id: 'asc' },
      }),
      prisma.memberRole.findMany({
        where: { member: { serverId: serverA } },
        orderBy: [{ memberId: 'asc' }, { roleId: 'asc' }],
      }),
      prisma.member.count({ where: { userId: bob.id } }),
      prisma.customEmoji.findMany({ where: { serverId: serverA }, orderBy: { id: 'asc' } }),
      prisma.channelCategory.findMany({ where: { serverId: serverA }, orderBy: { id: 'asc' } }),
    ]);
    return JSON.parse(
      JSON.stringify(
        {
          server,
          members,
          roles,
          channels,
          messages,
          memberRoles,
          carolSessions,
          emojis,
          categories,
        },
        (_k, v) => (typeof v === 'bigint' ? v.toString() : v),
      ),
    );
  }

  beforeAll(async () => {
    app = await bootApp();
    prisma = app.get(PrismaService);
    await app.get(RedisProvider).flushdb();
    [alice, carol, bob, dan] = await Promise.all([
      register('a'),
      register('c'),
      register('b'),
      register('d'),
    ]);
    aliceSession = (await prisma.session.findFirst({
      where: { userId: alice.id },
      select: { id: true },
    }))!.id;

    const a = await as(alice, 'post', '/servers').send({ name: SECRET }).expect(201);
    serverA = a.body.id;
    channelA = a.body.channels[0].id;
    roleA = (
      await as(alice, 'post', `/servers/${serverA}/roles`)
        .send({ name: `role-${SECRET}`, permissions: '2' })
        .expect(201)
    ).body.id;
    await as(carol, 'post', '/servers/join').send({ inviteCode: a.body.inviteCode }).expect(201);

    const b = await as(bob, 'post', '/servers')
      .send({ name: `other-${runId}` })
      .expect(201);
    serverB = b.body.id;

    const membersA = (await as(alice, 'get', `/servers/${serverA}/members`).expect(200)).body
      .members as Array<{ id: string; userId: string }>;
    aliceMemberA = membersA.find((m) => m.userId === alice.id)!.id;
    carolMemberA = membersA.find((m) => m.userId === carol.id)!.id;
    const membersB = (await as(bob, 'get', `/servers/${serverB}/members`).expect(200)).body
      .members as Array<{ id: string; userId: string }>;
    bobMemberB = membersB.find((m) => m.userId === bob.id)!.id;

    aliceMessage = (
      await as(alice, 'post', `/channels/${channelA}/messages`)
        .send({ content: `alice ${SECRET}`, nonce: randomUUID() })
        .expect(201)
    ).body.id;
    carolMessage = (
      await as(carol, 'post', `/channels/${channelA}/messages`)
        .send({ content: `carol ${SECRET}`, nonce: randomUUID() })
        .expect(201)
    ).body.id;
    uploadId = (
      await as(alice, 'post', '/uploads')
        .send({ channelId: channelA, filename: 'a.pdf', sizeBytes: 10, nonce: randomUUID() })
        .expect(201)
    ).body.id;

    const packA = await prisma.stickerPack.create({
      data: { serverId: serverA, name: `pack-${runId}` },
    });
    stickerPackA = packA.id;
    const attA = await prisma.attachment.create({
      data: {
        uploaderId: alice.id,
        nonce: randomUUID(),
        filename: 'sticker.webp',
        sizeBytes: 64,
        quotaBytes: 64,
        scope: 'sticker',
        serverId: serverA,
        status: 'ready',
        boundAt: new Date(),
        rawRemoved: true,
        mime: 'image/webp',
        width: 8,
        height: 8,
      },
    });
    stickerA = (
      await prisma.sticker.create({
        data: {
          packId: packA.id,
          name: 'idor-sticker',
          tags: [],
          attachmentId: attA.id,
          createdBy: alice.id,
        },
      })
    ).id;

    const emojiAttA = await prisma.attachment.create({
      data: {
        uploaderId: alice.id,
        nonce: randomUUID(),
        filename: 'emoji.webp',
        sizeBytes: 64,
        quotaBytes: 64,
        scope: 'customEmoji',
        serverId: serverA,
        status: 'ready',
        boundAt: new Date(),
        rawRemoved: true,
        mime: 'image/webp',
        width: 8,
        height: 8,
      },
    });
    emojiA = (
      await prisma.customEmoji.create({
        data: {
          serverId: serverA,
          name: 'idoremoji',
          animated: false,
          attachmentId: emojiAttA.id,
          createdBy: alice.id,
        },
      })
    ).id;

    categoryA = (
      await as(alice, 'post', `/servers/${serverA}/categories`)
        .send({ name: `cat-${SECRET}` })
        .expect(201)
    ).body.id;
  });

  afterAll(async () => {
    if (stickerPackA) {
      await prisma.sticker.deleteMany({ where: { packId: stickerPackA } });
      await prisma.stickerPack.deleteMany({ where: { id: stickerPackA } });
    }
    if (serverA) await prisma.customEmoji.deleteMany({ where: { serverId: serverA } });
    await prisma.attachment.deleteMany({ where: { serverId: serverA } });
    const users = await prisma.user.findMany({
      where: { email: { in: emails } },
      select: { id: true },
    });
    const ids = users.map((user) => user.id);
    await prisma.message.deleteMany({ where: { authorId: { in: ids } } });
    await prisma.server.deleteMany({ where: { ownerId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  interface Attack {
    name: string;
    by: () => Actor;
    verb: Verb;
    url: () => string;
    body?: () => unknown;
    accept: number[];
  }

  const attacks = (): Attack[] => {
    const out: Attack[] = [];
    const add = (
      name: string,
      verb: Verb,
      url: () => string,
      who: Array<() => Actor>,
      body?: () => unknown,
      accept: number[] = [403, 404],
    ) => who.forEach((by) => out.push({ name, by, verb, url, body, accept }));
    const outsider = [() => dan, () => bob];
    for (const [verb, suffix] of [
      ['get', ''],
      ['delete', ''],
      ['post', '/complete'],
      ['put', '/content'],
    ] as const) {
      add(`${verb} upload A`, verb, () => `/uploads/${uploadId}${suffix}`, [
        ...outsider,
        () => carol,
      ]);
    }
    add('attachment download A', 'get', () => `/attachments/${uploadId}/download`, outsider);
    add(
      'signed attachment with forged signature',
      'get',
      () =>
        `/attachments/${uploadId}/file?user=${alice.id}&expires=${Math.floor(Date.now() / 1000) + 30}&signature=${'0'.repeat(64)}`,
      outsider,
    );
    add(
      'create upload in another server',
      'post',
      () => '/uploads',
      outsider,
      () => ({ channelId: channelA, filename: 'secret.pdf', sizeBytes: 10, nonce: randomUUID() }),
    );
    const lowPriv = [() => dan, () => bob, () => carol];

    add('GET /servers/:serverId', 'get', () => `/servers/${serverA}`, outsider);
    add(
      'GET /servers/:serverId/me/permissions',
      'get',
      () => `/servers/${serverA}/me/permissions`,
      outsider,
    );
    add('GET /servers/:serverId/members', 'get', () => `/servers/${serverA}/members`, outsider);
    add(
      'PATCH /servers/:serverId/members/me',
      'patch',
      () => `/servers/${serverA}/members/me`,
      outsider,
    );
    add('POST /servers/:serverId/leave', 'post', () => `/servers/${serverA}/leave`, outsider);
    add(
      'DELETE /servers/:serverId/members/:memberId',
      'delete',
      () => `/servers/${serverA}/members/${aliceMemberA}`,
      lowPriv,
    );
    add('DELETE /servers/:serverId', 'delete', () => `/servers/${serverA}`, lowPriv);
    add('GET /servers/:serverId/channels', 'get', () => `/servers/${serverA}/channels`, outsider);
    add(
      'POST /servers/:serverId/channels',
      'post',
      () => `/servers/${serverA}/channels`,
      lowPriv,
      () => ({ name: `x-${SECRET}` }),
    );
    add(
      'PATCH /channels/:channelId',
      'patch',
      () => `/channels/${channelA}`,
      lowPriv,
      () => ({ name: 'hacked' }),
    );
    add('DELETE /channels/:channelId', 'delete', () => `/channels/${channelA}`, lowPriv);
    add('GET /servers/:serverId/roles', 'get', () => `/servers/${serverA}/roles`, lowPriv);
    add(
      'POST /servers/:serverId/roles',
      'post',
      () => `/servers/${serverA}/roles`,
      lowPriv,
      () => ({ name: 'evil', permissions: '64' }),
    );
    add(
      'PUT /servers/:serverId/members/:memberId/roles',
      'put',
      () => `/servers/${serverA}/members/${carolMemberA}/roles`,
      lowPriv,
      () => ({ roleIds: [roleA] }),
    );
    add(
      'PATCH /roles/:roleId',
      'patch',
      () => `/roles/${roleA}`,
      lowPriv,
      () => ({ permissions: '64' }),
    );
    add('DELETE /roles/:roleId', 'delete', () => `/roles/${roleA}`, lowPriv);
    add(
      'POST /servers/:serverId/invite/regenerate',
      'post',
      () => `/servers/${serverA}/invite/regenerate`,
      lowPriv,
      () => ({}),
    );
    add(
      'GET /channels/:channelId/messages',
      'get',
      () => `/channels/${channelA}/messages`,
      outsider,
    );
    add(
      'GET /channels/:channelId/messages?around=<tin của A>',
      'get',
      () => `/channels/${channelA}/messages?around=${aliceMessage}`,
      outsider,
    );
    add(
      'POST /channels/:channelId/messages',
      'post',
      () => `/channels/${channelA}/messages`,
      outsider,
      () => ({ content: 'intruder', nonce: randomUUID() }),
    );
    add(
      'PUT /channels/:channelId/read',
      'put',
      () => `/channels/${channelA}/read`,
      outsider,
      () => ({ messageId: randomUUID() }),
    );
    add('GET /servers/:serverId/unread', 'get', () => `/servers/${serverA}/unread`, outsider);
    add(
      'GET /servers/:serverId/search',
      'get',
      () => `/servers/${serverA}/search?q=${SECRET}`,
      outsider,
    );
    add(
      'PATCH /messages/:messageId (của người khác)',
      'patch',
      () => `/messages/${aliceMessage}`,
      [...outsider, () => carol],
      () => ({ content: 'hacked' }),
    );
    add(
      'DELETE /messages/:messageId (của người khác)',
      'delete',
      () => `/messages/${aliceMessage}`,
      [...outsider, () => carol],
    );
    add(
      'PATCH /messages/:messageId (tin của carol, người ngoài)',
      'patch',
      () => `/messages/${carolMessage}`,
      outsider,
      () => ({ content: 'hacked' }),
    );
    add(
      'DELETE /messages/:messageId (tin của carol, người ngoài)',
      'delete',
      () => `/messages/${carolMessage}`,
      outsider,
    );
    add(
      'GET /messages/:messageId/reactions/:emoji (tin của A)',
      'get',
      () => `/messages/${aliceMessage}/reactions/${encodeURIComponent('👍')}`,
      outsider,
    );
    add(
      'PUT /messages/:messageId/reactions/:emoji (tin của A)',
      'put',
      () => `/messages/${aliceMessage}/reactions/${encodeURIComponent('👍')}`,
      outsider,
    );
    add(
      'DELETE /messages/:messageId/reactions/:emoji (tin của A)',
      'delete',
      () => `/messages/${aliceMessage}/reactions/${encodeURIComponent('👍')}`,
      outsider,
    );
    add(
      'GET /channels/:channelId/pins (channel của A)',
      'get',
      () => `/channels/${channelA}/pins`,
      outsider,
    );
    add(
      'PUT /messages/:messageId/pin (tin của A)',
      'put',
      () => `/messages/${aliceMessage}/pin`,
      lowPriv,
    );
    add(
      'DELETE /messages/:messageId/pin (tin của A)',
      'delete',
      () => `/messages/${aliceMessage}/pin`,
      lowPriv,
    );

    add(
      'chéo: DELETE /servers/B/members/<member của A>',
      'delete',
      () => `/servers/${serverB}/members/${carolMemberA}`,
      [() => bob],
    );
    add(
      'chéo: PUT /servers/B/members/<member của A>/roles',
      'put',
      () => `/servers/${serverB}/members/${carolMemberA}/roles`,
      [() => bob],
      () => ({ roleIds: [] }),
    );
    add(
      'chéo: PUT /servers/B/members/<bob>/roles với role của A',
      'put',
      () => `/servers/${serverB}/members/${bobMemberB}/roles`,
      [() => bob],
      () => ({ roleIds: [roleA] }),
      [400, 403, 404],
    );
    add(
      'chéo: PATCH /roles/<role của A> bởi chủ B',
      'patch',
      () => `/roles/${roleA}`,
      [() => bob],
      () => ({ name: 'taken' }),
    );
    add(
      'chéo: DELETE /channels/<channel của A> bởi chủ B',
      'delete',
      () => `/channels/${channelA}`,
      [() => bob],
    );
    add(
      'chéo: POST message vào channel của A bởi chủ B',
      'post',
      () => `/channels/${channelA}/messages`,
      [() => bob],
      () => ({ content: 'from B', nonce: randomUUID() }),
    );

    add('GET /servers/:serverId/stickers', 'get', () => `/servers/${serverA}/stickers`, outsider);
    add(
      'POST /servers/:serverId/stickers',
      'post',
      () => `/servers/${serverA}/stickers`,
      lowPriv,
      () => ({ attachmentId: randomUUID(), name: 'x' }),
    );
    add('DELETE /stickers/<sticker của A>', 'delete', () => `/stickers/${stickerA}`, outsider);
    add('DELETE /emojis/<emoji của A>', 'delete', () => `/emojis/${emojiA}`, outsider);
    add(
      'POST /servers/:serverId/categories',
      'post',
      () => `/servers/${serverA}/categories`,
      lowPriv,
      () => ({ name: 'x' }),
    );
    add(
      'PUT /servers/:serverId/categories/reorder',
      'put',
      () => `/servers/${serverA}/categories/reorder`,
      lowPriv,
      () => ({ orderedIds: [categoryA] }),
    );
    add(
      'PATCH /servers/:serverId/categories/:categoryId',
      'patch',
      () => `/servers/${serverA}/categories/${categoryA}`,
      lowPriv,
      () => ({ name: 'evil' }),
    );
    add(
      'DELETE /servers/:serverId/categories/:categoryId',
      'delete',
      () => `/servers/${serverA}/categories/${categoryA}`,
      lowPriv,
    );
    add(
      'PUT /channels/:channelId/move (channel của A)',
      'put',
      () => `/channels/${channelA}/move`,
      lowPriv,
      () => ({ categoryId: categoryA }),
    );
    add(
      'PATCH /channels/:channelId/topic (channel của A)',
      'patch',
      () => `/channels/${channelA}/topic`,
      lowPriv,
      () => ({ topic: 'hacked' }),
    );
    add(
      'chéo: PATCH /servers/B/categories/<category của A>',
      'patch',
      () => `/servers/${serverB}/categories/${categoryA}`,
      [() => bob],
      () => ({ name: 'evil' }),
    );
    add(
      'DELETE /users/me/sessions/<phiên của alice>',
      'delete',
      () => `/users/me/sessions/${aliceSession}`,
      outsider,
    );
    add(
      'POST /servers/:serverId/emojis',
      'post',
      () => `/servers/${serverA}/emojis`,
      lowPriv,
      () => ({ attachmentId: randomUUID(), name: 'nope' }),
    );
    add('GET /servers/:serverId/bans', 'get', () => `/servers/${serverA}/bans`, lowPriv);
    add(
      'POST /servers/:serverId/bans',
      'post',
      () => `/servers/${serverA}/bans`,
      lowPriv,
      () => ({ userId: dan.id }),
    );
    add(
      'DELETE /servers/:serverId/bans/:userId',
      'delete',
      () => `/servers/${serverA}/bans/${dan.id}`,
      lowPriv,
    );
    return out;
  };

  it('every attack is rejected with 403/404, leaks nothing, and changes nothing in server A', async () => {
    const before = await snapshotA();
    const failures: string[] = [];
    for (const attack of attacks()) {
      const actor = attack.by();
      const call = as(actor, attack.verb, attack.url());
      const res = attack.body ? await call.send(attack.body() as object) : await call;
      const label = `${attack.name} bởi ${actor.email.split('-')[1]}`;
      if (!attack.accept.includes(res.status)) failures.push(`${label}: status ${res.status}`);
      if (JSON.stringify(res.body).includes(SECRET))
        failures.push(`${label}: body lộ dữ liệu của server A`);
    }
    expect(failures).toEqual([]);
    expect(await snapshotA()).toEqual(before);
  });

  it('a plain member cannot read what they were never granted (controls: allowed paths still work)', async () => {
    await as(carol, 'get', `/servers/${serverA}`).expect(200);
    await as(carol, 'get', `/channels/${channelA}/messages`).expect(200);
    await as(carol, 'patch', `/messages/${carolMessage}`)
      .send({ content: 'carol edits her own' })
      .expect(200);
    await as(
      carol,
      'put',
      `/messages/${aliceMessage}/reactions/${encodeURIComponent('👍')}`,
    ).expect(200);
    await as(alice, 'get', `/servers/${serverA}/roles`).expect(200);
  });

  it('no token → 401 on every endpoint that takes an id', async () => {
    const uuid = randomUUID();
    expect(ID_ROUTES).toHaveLength(61);
    for (const [verb, template] of ID_ROUTES) {
      const url = template.replaceAll(':id', uuid);
      const res = await as(undefined, verb, url).send({});
      expect(res.status, `${verb.toUpperCase()} ${url}`).toBe(
        template.endsWith('/file') ? 400 : 401,
      );
    }
  });

  it('ID_ROUTES lists every endpoint of the app that takes an id (a new one fails here until it is added)', () => {
    expect(discoverIdRoutes(app)).toEqual(
      ID_ROUTES.map(([verb, path]) => `${verb} ${path}`).sort(),
    );
  });

  it('a malformed id is a 400, never reaches the database', async () => {
    await as(alice, 'get', '/servers/not-a-uuid').expect(400);
    await as(alice, 'patch', '/messages/123').send({ content: 'x' }).expect(400);
  });
});
