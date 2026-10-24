import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Permissions } from '@ping/shared';
import cookieParser from 'cookie-parser';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/infra/prisma/prisma.service.js';
import { RedisProvider } from '../src/infra/redis/redis.module.js';

const runId = Date.now().toString(36);

interface TestUser {
  id: string;
  email: string;
  token: string;
}

type HttpMethod = 'get' | 'post' | 'patch' | 'put' | 'delete';

/**
 * Bộ test quyền của Bước 8 (guide 10.5): đủ quyền / thiếu quyền / không phải
 * member, cùng vòng đời server — channel — role — member.
 *
 * Dùng ĐÚNG 4 user (trần register là 5/phút/IP) và KHÔNG login lại: access token
 * lấy luôn từ response register để không tiêu vào hạn mức login 10/phút.
 */
describe('Servers, channels & roles (e2e)', () => {
  let app: INestApplication;
  const emails: string[] = [];

  let owner: TestUser;
  let plain: TestUser;
  let joiner: TestUser;
  let outsider: TestUser;
  let serverId: string;
  let inviteCode: string;

  const uniqueSuffix = () => Math.random().toString(36).slice(2, 8);

  async function registerUser(): Promise<TestUser> {
    const email = `s-${runId}-${uniqueSuffix()}@ping.dev`;
    const username = `s${runId}${uniqueSuffix()}`.slice(0, 32);
    emails.push(email);

    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/register')
      .send({ email, username, password: 'password123', displayName: 'E2E' })
      .expect(201);

    return { id: res.body.user.id, email, token: res.body.accessToken };
  }

  /** supertest chain: gọi `api(...)` rồi `.send(...).expect(...)`. */
  function api(method: HttpMethod, url: string, token?: string) {
    const agent = request(app.getHttpServer());
    const call = {
      get: () => agent.get(url),
      post: () => agent.post(url),
      patch: () => agent.patch(url),
      put: () => agent.put(url),
      delete: () => agent.delete(url),
    }[method]();
    return token ? call.set('Authorization', `Bearer ${token}`) : call;
  }

  async function memberIdOf(user: TestUser): Promise<string> {
    const res = await api('get', `/api/v1/servers/${serverId}/members`, owner.token).expect(200);
    const member = res.body.members.find((item: { userId: string }) => item.userId === user.id);
    if (!member) {
      throw new Error('Member not found');
    }
    return member.id;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    // main.ts không chạy trong e2e: tự lắp cookie-parser + global prefix như thật.
    app.use(cookieParser());
    app.setGlobalPrefix('api/v1');
    await app.init();

    // Redis trong e2e là Redis thật, sống qua các run — xóa để cửa sổ rate limit
    // (và cache ability 30s) không dính dữ liệu của run trước.
    const redis = moduleRef.get(RedisProvider);
    await redis.flushdb();

    owner = await registerUser();
    plain = await registerUser();
    joiner = await registerUser();
    outsider = await registerUser();
  });

  afterAll(async () => {
    const prisma = app.get(PrismaService);
    const users = await prisma.user.findMany({
      where: { email: { in: emails } },
      select: { id: true },
    });
    const userIds = users.map((user) => user.id);
    // Message.author là Restrict: xóa tin trước, rồi tới server (cascade phần còn lại).
    await prisma.message.deleteMany({ where: { authorId: { in: userIds } } });
    await prisma.server.deleteMany({ where: { ownerId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await app.close();
  });

  it('POST /servers — tạo server kèm role @everyone, channel general và owner là member (một lần insert nguyên tử)', async () => {
    const res = await api('post', '/api/v1/servers', owner.token)
      .send({ name: 'Ping Test Server' })
      .expect(201);

    serverId = res.body.id;
    inviteCode = res.body.inviteCode;

    expect(res.body).toMatchObject({ name: 'Ping Test Server', ownerId: owner.id });
    expect(res.body.inviteCode).toHaveLength(8);
    expect(res.body.roles).toHaveLength(1);
    expect(res.body.roles[0]).toMatchObject({ name: '@everyone', isDefault: true });
    expect(res.body.channels).toHaveLength(1);
    expect(res.body.channels[0]).toMatchObject({ name: 'general', position: 0 });

    const mine = await api('get', '/api/v1/servers', owner.token).expect(200);
    expect(mine.body.map((server: { id: string }) => server.id)).toContain(serverId);

    const members = await api('get', `/api/v1/servers/${serverId}/members`, owner.token).expect(
      200,
    );
    expect(members.body.members).toHaveLength(1);
    expect(members.body.members[0].userId).toBe(owner.id);
    expect(
      members.body.members[0].roles.map((entry: { role: { name: string } }) => entry.role.name),
    ).toContain('@everyone');
  });

  it('POST /servers/join — vào server bằng mã mời và luôn nhận role @everyone; trùng → 409, mã sai → 404', async () => {
    const joined = await api('post', '/api/v1/servers/join', plain.token)
      .send({ inviteCode })
      .expect(201);
    expect(joined.body.server.id).toBe(serverId);
    expect(
      joined.body.member.roles.map((entry: { role: { name: string } }) => entry.role.name),
    ).toContain('@everyone');

    await api('post', '/api/v1/servers/join', joiner.token).send({ inviteCode }).expect(201);
    await api('post', '/api/v1/servers/join', plain.token).send({ inviteCode }).expect(409);
    await api('post', '/api/v1/servers/join', outsider.token)
      .send({ inviteCode: 'khong-ton-tai' })
      .expect(404);
  });

  it('POST /servers/:id/invite/regenerate — mã cũ vô hiệu (INVITE_REVOKED), mã mới join được, hết hạn (INVITE_EXPIRED), audit ghi hành động (T3.6)', async () => {
    // Thành viên thường và người ngoài đều không có `update Server`.
    await api('post', `/api/v1/servers/${serverId}/invite/regenerate`, plain.token)
      .send({})
      .expect(403);
    await api('post', `/api/v1/servers/${serverId}/invite/regenerate`, outsider.token)
      .send({})
      .expect(403);

    // Owner regenerate: mã mới không hạn dùng; mã cũ bị thu hồi.
    const regen = await api('post', `/api/v1/servers/${serverId}/invite/regenerate`, owner.token)
      .send({})
      .expect(201);
    expect(regen.body.invite.code).toHaveLength(8);
    expect(regen.body.invite.expiresAt).toBeNull();
    expect(regen.body.invite.code).not.toBe(inviteCode);

    await api('post', '/api/v1/servers/join', joiner.token)
      .send({ inviteCode })
      .expect(410)
      .expect((res) => expect(res.body.code).toBe('INVITE_REVOKED'));

    // Mã mới hoạt động: outsider vào được rồi rời ra để không ảnh hưởng test sau.
    await api('post', '/api/v1/servers/join', outsider.token)
      .send({ inviteCode: regen.body.invite.code })
      .expect(201);
    await api('post', `/api/v1/servers/${serverId}/leave`, outsider.token).expect(204);

    // Hạn dùng quá khứ (gán trực tiếp trong DB) → INVITE_EXPIRED.
    const prisma = app.get(PrismaService);
    await prisma.serverInvite.updateMany({
      where: { code: regen.body.invite.code },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });
    await api('post', '/api/v1/servers/join', outsider.token)
      .send({ inviteCode: regen.body.invite.code })
      .expect(410)
      .expect((res) => expect(res.body.code).toBe('INVITE_EXPIRED'));

    // Detail trả kèm hạn dùng (đã quá hạn) để UI hiển thị.
    const detail = await api('get', `/api/v1/servers/${serverId}`, owner.token).expect(200);
    expect(typeof detail.body.inviteExpiresAt).toBe('string');

    // Audit đã ghi regenerate (trước các hành động khác nên nằm cuối danh sách giảm dần).
    const audit = await api('get', `/api/v1/servers/${serverId}/audit-log`, owner.token).expect(
      200,
    );
    const entry = audit.body.entries.find(
      (item: { action: string }) => item.action === 'SERVER_INVITE_REGENERATE',
    );
    expect(entry).toMatchObject({ targetId: expect.any(String), metadata: { expiresAt: null } });
  });

  it('PATCH /servers/:id - đổi tên cần MANAGE_SERVER, tên hợp lệ, và ghi audit SERVER_UPDATE', async () => {
    // Thành viên thường và người ngoài đều không có `update Server`.
    await api('patch', `/api/v1/servers/${serverId}`, plain.token)
      .send({ name: 'hack' })
      .expect(403);
    await api('patch', `/api/v1/servers/${serverId}`, outsider.token)
      .send({ name: 'hack' })
      .expect(403);

    // Cùng schema zod với lúc tạo server: tên rỗng (sau trim) bị chặn.
    await api('patch', `/api/v1/servers/${serverId}`, owner.token)
      .send({ name: '   ' })
      .expect(400);

    const updated = await api('patch', `/api/v1/servers/${serverId}`, owner.token)
      .send({ name: 'Ping Đổi Tên' })
      .expect(200);
    expect(updated.body).toEqual({ id: serverId, name: 'Ping Đổi Tên' });

    const detail = await api('get', `/api/v1/servers/${serverId}`, plain.token).expect(200);
    expect(detail.body.name).toBe('Ping Đổi Tên');

    // Audit ghi trong cùng transaction, kèm tên trước/sau để đối chiếu.
    const audit = await api('get', `/api/v1/servers/${serverId}/audit-log`, owner.token).expect(
      200,
    );
    expect(audit.body.entries[0]).toMatchObject({
      action: 'SERVER_UPDATE',
      targetId: serverId,
      metadata: { from: 'Ping Test Server', to: 'Ping Đổi Tên' },
    });
  });

  it('AbilityGuard chặn sớm - người không phải member không thấy gì của server (403)', async () => {
    await api('get', `/api/v1/servers/${serverId}`, outsider.token).expect(403);
    await api('get', `/api/v1/servers/${serverId}/channels`, outsider.token).expect(403);
    await api('get', `/api/v1/servers/${serverId}/members`, outsider.token).expect(403);
    await api('post', `/api/v1/servers/${serverId}/channels`, outsider.token)
      .send({ name: 'hack' })
      .expect(403);
  });

  it('member đã xác thực xem được server/channel/member dù không có bit quyền nào thêm', async () => {
    const detail = await api('get', `/api/v1/servers/${serverId}`, plain.token).expect(200);
    expect(detail.body.id).toBe(serverId);

    const channels = await api('get', `/api/v1/servers/${serverId}/channels`, plain.token).expect(
      200,
    );
    expect(channels.body.map((channel: { name: string }) => channel.name)).toContain('general');

    const members = await api('get', `/api/v1/servers/${serverId}/members`, plain.token).expect(
      200,
    );
    expect(members.body.members).toHaveLength(3); // owner + plain + joiner
  });

  it('member thiếu MANAGE_CHANNELS → tạo channel 403', async () => {
    await api('post', `/api/v1/servers/${serverId}/channels`, plain.token)
      .send({ name: 'nope' })
      .expect(403);
  });

  it('owner tạo role + gán cho member → quyền hiệu lực đổi NGAY (cache ability bị xóa)', async () => {
    const moderatorPermissions =
      Permissions.VIEW_CHANNEL |
      Permissions.SEND_MESSAGES |
      Permissions.MANAGE_CHANNELS |
      Permissions.MANAGE_MESSAGES;

    const role = await api('post', `/api/v1/servers/${serverId}/roles`, owner.token)
      .send({ name: 'moderator', permissions: moderatorPermissions.toString() })
      .expect(201);

    const plainMemberId = await memberIdOf(plain);
    const assigned = await api(
      'put',
      `/api/v1/servers/${serverId}/members/${plainMemberId}/roles`,
      owner.token,
    )
      .send({ roleIds: [role.body.id] })
      .expect(200);
    expect(
      assigned.body.roles.map((entry: { role: { name: string } }) => entry.role.name),
    ).toContain('moderator');

    // Cache ability của plain (đang là bản "không quyền") phải bị RolesService xóa —
    // nếu không, request này vẫn thấy 403 và test đỏ.
    await api('post', `/api/v1/servers/${serverId}/channels`, plain.token)
      .send({ name: 'announcements' })
      .expect(201);
  });

  it('MANAGE_CHANNELS cho phép tạo/sửa/xóa channel', async () => {
    const created = await api('post', `/api/v1/servers/${serverId}/channels`, plain.token)
      .send({ name: 'tmp' })
      .expect(201);

    const updated = await api('patch', `/api/v1/channels/${created.body.id}`, plain.token)
      .send({ name: 'renamed', position: 5 })
      .expect(200);
    expect(updated.body).toMatchObject({ name: 'renamed', position: 5 });

    await api('delete', `/api/v1/channels/${created.body.id}`, plain.token).expect(200);

    const list = await api('get', `/api/v1/servers/${serverId}/channels`, plain.token).expect(200);
    expect(list.body.map((channel: { id: string }) => channel.id)).not.toContain(created.body.id);
  });

  it('siết quyền role lại → member mất quyền tạo channel ngay (invalidate lần hai)', async () => {
    const roles = await api('get', `/api/v1/servers/${serverId}/roles`, owner.token).expect(200);
    const moderator = roles.body.find((role: { name: string }) => role.name === 'moderator');
    expect(moderator).toBeDefined();

    await api('patch', `/api/v1/roles/${moderator.id}`, owner.token)
      .send({ permissions: '0' })
      .expect(200);

    await api('post', `/api/v1/servers/${serverId}/channels`, plain.token)
      .send({ name: 'nope-again' })
      .expect(403);
  });

  it('role @everyone không xóa được; member thường không tạo role được', async () => {
    await api('post', `/api/v1/servers/${serverId}/roles`, joiner.token)
      .send({ name: 'hack' })
      .expect(403);

    const roles = await api('get', `/api/v1/servers/${serverId}/roles`, owner.token).expect(200);
    const everyone = roles.body.find((role: { isDefault: boolean }) => role.isDefault);
    await api('delete', `/api/v1/roles/${everyone.id}`, owner.token).expect(400);

    const temp = await api('post', `/api/v1/servers/${serverId}/roles`, owner.token)
      .send({ name: 'temp' })
      .expect(201);
    await api('delete', `/api/v1/roles/${temp.body.id}`, owner.token).expect(200);
  });

  it('leave — member rời server mất quyền truy cập ngay; owner không rời được', async () => {
    await api('post', `/api/v1/servers/${serverId}/leave`, joiner.token).expect(204);
    await api('get', `/api/v1/servers/${serverId}/channels`, joiner.token).expect(403);

    await api('post', `/api/v1/servers/${serverId}/leave`, owner.token).expect(400);
  });

  it('xóa server — chỉ owner; cascade dọn channel/role/member', async () => {
    await api('delete', `/api/v1/servers/${serverId}`, plain.token).expect(403);
    await api('delete', `/api/v1/servers/${serverId}`, owner.token).expect(200);

    // Server biến mất cùng membership: chính owner giờ cũng là "người lạ".
    await api('get', `/api/v1/servers/${serverId}`, owner.token).expect(403);

    const mine = await api('get', '/api/v1/servers', owner.token).expect(200);
    expect(mine.body.map((server: { id: string }) => server.id)).not.toContain(serverId);
  });
});
