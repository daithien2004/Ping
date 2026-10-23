import { describe, expect, it } from 'vitest';
import { Permissions } from '@ping/shared';
import { maskOf, permissionGroups, permissionsOf } from './permissions';

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
