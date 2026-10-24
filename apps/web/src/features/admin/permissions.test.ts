import { describe, expect, it } from 'vitest';
import { Permissions, type AbilityContext, type MemberDto, type RoleDto } from '@ping/shared';
import {
  assignableRoles,
  effectiveMemberPermissions,
  isRoleAssignable,
  kickBlockReason,
  maskOf,
  memberContext,
  nextPosition,
  permissionGroups,
  permissionsOf,
  reorderUpdates,
} from './permissions';

function role(
  input: Pick<RoleDto, 'id' | 'name' | 'permissions' | 'position'> &
    Partial<Pick<RoleDto, 'isDefault'>>,
): RoleDto {
  return { serverId: 'server-1', isDefault: false, ...input };
}

function member(roleIds: string[], userId = 'member-1'): MemberDto {
  return {
    id: 'member-row-1',
    serverId: 'server-1',
    userId,
    nickname: null,
    joinedAt: '2026-10-24T00:00:00.000Z',
    user: { id: userId, username: 'member', displayName: 'Member', avatarUrl: null },
    roles: roleIds.map((id) => ({ role: { id, name: id } })),
    online: false,
  };
}

function actor(permissions: bigint, isOwner = false, userId = 'actor-1'): AbilityContext {
  return { userId, isOwner, permissions };
}

describe('quyền của vai trò (TF.10)', () => {
  it('đọc bitmask thành đúng các bit đang bật', () => {
    const mask = Permissions.VIEW_CHANNEL | Permissions.VIEW_AUDIT_LOG;

    expect(permissionsOf(mask)).toEqual([Permissions.VIEW_CHANNEL, Permissions.VIEW_AUDIT_LOG]);
  });

  it('mỗi quyền trong nhóm đều có bit riêng (không trùng nhau)', () => {
    const bits = permissionGroups.flatMap((group) => group.options.map((option) => option.bit));

    expect(new Set(bits).size).toBe(bits.length);
  });

  it('gom danh sách bit thành bitmask tương đương', () => {
    const mask = Permissions.VIEW_CHANNEL | Permissions.MANAGE_ROLES;

    expect(maskOf(permissionsOf(mask))).toBe(mask);
  });

  it('bỏ bit khi tắt quyền (mô phỏng thao tác trên ô tick)', () => {
    const mask = Permissions.VIEW_CHANNEL | Permissions.VIEW_AUDIT_LOG;
    const cleared = mask & ~Permissions.VIEW_AUDIT_LOG;

    expect(permissionsOf(cleared)).toEqual([Permissions.VIEW_CHANNEL]);
  });
});

describe('gán vai trò cho thành viên (T3.3)', () => {
  const everyone = role({
    id: 'everyone',
    name: '@everyone',
    permissions: Permissions.VIEW_CHANNEL.toString(),
    position: 0,
    isDefault: true,
  });
  const reader = role({
    id: 'reader',
    name: 'reader',
    permissions: Permissions.VIEW_CHANNEL.toString(),
    position: 1,
  });
  const moderator = role({
    id: 'moderator',
    name: 'moderator',
    permissions: (Permissions.VIEW_CHANNEL | Permissions.MANAGE_MESSAGES).toString(),
    position: 2,
  });
  const admin = role({
    id: 'admin',
    name: 'admin',
    permissions: Permissions.ADMINISTRATOR.toString(),
    position: 3,
  });

  it('quyền hiệu lực gồm @everyone kể cả khi MemberDto không liệt kê @everyone', () => {
    const mask = effectiveMemberPermissions(member(['moderator']), [
      everyone,
      reader,
      moderator,
      admin,
    ]);

    expect(mask).toBe(Permissions.VIEW_CHANNEL | Permissions.MANAGE_MESSAGES);
  });

  it('không gán được role mạnh hơn quyền của mình hoặc role @everyone', () => {
    const manager = actor(Permissions.VIEW_CHANNEL | Permissions.MANAGE_ROLES);
    const target = actor(Permissions.VIEW_CHANNEL);

    expect(isRoleAssignable(manager, target, reader)).toBe(true);
    expect(isRoleAssignable(manager, target, moderator)).toBe(false);
    expect(isRoleAssignable(manager, target, admin)).toBe(false);
    expect(isRoleAssignable(manager, target, everyone)).toBe(false);
  });

  it('không đổi được role của owner hoặc thành viên mạnh hơn mình', () => {
    const manager = actor(Permissions.VIEW_CHANNEL | Permissions.MANAGE_ROLES);
    const ownerTarget = actor(Permissions.VIEW_CHANNEL, true);
    const strongerTarget = actor(BigInt(admin.permissions));

    expect(isRoleAssignable(manager, ownerTarget, reader)).toBe(false);
    expect(isRoleAssignable(manager, strongerTarget, reader)).toBe(false);
    expect(isRoleAssignable(actor(0n, true), ownerTarget, reader)).toBe(true);
  });

  it('dựng ngữ cảnh của member từ danh sách role và chủ server', () => {
    const target = memberContext(member(['moderator']), [everyone, reader, moderator], 'owner-1');

    expect(target).toEqual({
      userId: 'member-1',
      isOwner: false,
      permissions: Permissions.VIEW_CHANNEL | Permissions.MANAGE_MESSAGES,
    });
  });

  it('danh sách role gán được bỏ @everyone và role vượt quyền', () => {
    const manager = actor(Permissions.VIEW_CHANNEL | Permissions.MANAGE_ROLES);
    const target = actor(Permissions.VIEW_CHANNEL);

    expect(
      assignableRoles(manager, target, [everyone, reader, moderator, admin]).map((r) => r.id),
    ).toEqual(['reader']);
  });

  it('vị trí role mới nằm sau role cuối', () => {
    expect(nextPosition([])).toBe(0);
    expect(nextPosition([everyone, reader, moderator])).toBe(3);
  });

  it('đổi thứ tự hiển thị bằng cách đánh lại vị trí liên tiếp', () => {
    expect(reorderUpdates([everyone, reader, moderator, admin], 'moderator', 'up')).toEqual([
      { id: 'moderator', position: 1 },
      { id: 'reader', position: 2 },
    ]);
    expect(reorderUpdates([everyone, reader, moderator, admin], 'moderator', 'down')).toEqual([
      { id: 'admin', position: 2 },
      { id: 'moderator', position: 3 },
    ]);
  });

  it('không đổi thứ tự khi đã ở biên hoặc định đụng @everyone', () => {
    expect(reorderUpdates([everyone, reader], 'reader', 'up')).toBeNull();
    expect(reorderUpdates([everyone, reader], 'everyone', 'down')).toBeNull();
    expect(reorderUpdates([everyone, reader], 'reader', 'down')).toBeNull();
    expect(reorderUpdates([everyone, reader], 'missing', 'up')).toBeNull();
  });

  it('vị trí trùng nhau vẫn đổi chỗ được', () => {
    const second = role({
      id: 'second',
      name: 'second',
      permissions: Permissions.VIEW_CHANNEL.toString(),
      position: 1,
    });

    expect(reorderUpdates([everyone, reader, second], 'second', 'up')).toEqual([
      { id: 'reader', position: 2 },
    ]);
  });
});

describe('kick thành viên (T3.4)', () => {
  const kicker = actor(Permissions.VIEW_CHANNEL | Permissions.KICK_MEMBERS);
  const weakTarget = actor(Permissions.VIEW_CHANNEL, false, 'target-1');

  it('người có KICK_MEMBERS kick được thành viên yếu hơn', () => {
    expect(kickBlockReason(kicker, weakTarget)).toBeNull();
  });

  it('không kick được thành viên mạnh hơn mình', () => {
    const strongTarget = actor(
      Permissions.VIEW_CHANNEL | Permissions.ADMINISTRATOR,
      false,
      'target-1',
    );

    expect(kickBlockReason(kicker, strongTarget)).toBe('stronger');
  });

  it('không kick được chủ server, kể cả khi mình là owner hay admin', () => {
    const owner = actor(Permissions.ADMINISTRATOR, true);
    const ownerTarget = actor(Permissions.VIEW_CHANNEL, true, 'owner-1');
    const admin = actor(Permissions.ADMINISTRATOR);

    expect(kickBlockReason(owner, ownerTarget)).toBe('owner');
    expect(kickBlockReason(admin, ownerTarget)).toBe('owner');
  });

  it('không kick được chính mình (dùng leave)', () => {
    expect(kickBlockReason(kicker, { ...kicker })).toBe('self');
  });

  it('owner và admin kick được thành viên mạnh hơn', () => {
    const strongTarget = actor(
      Permissions.VIEW_CHANNEL | Permissions.ADMINISTRATOR,
      false,
      'target-1',
    );

    expect(kickBlockReason(actor(Permissions.VIEW_CHANNEL, true), strongTarget)).toBeNull();
    expect(kickBlockReason(actor(Permissions.ADMINISTRATOR), strongTarget)).toBeNull();
  });
});
