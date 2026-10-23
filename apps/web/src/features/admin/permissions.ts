import { Permissions } from '@ping/shared';

export interface PermissionOption {
  /** Bit quyền trong `@ping/shared`. */
  bit: bigint;
  /** Khoá i18n của nhãn (namespace `admin.permissions`). */
  labelKey: string;
}

export interface PermissionGroup {
  /** Khoá i18n của tên nhóm (namespace `admin.permissionGroups`). */
  labelKey: string;
  options: readonly PermissionOption[];
}

/**
 * Nhóm quyền hiển thị trong trình sửa quyền của vai trò (TF.10). Thứ tự nhóm là thứ tự
 * hiển thị; bit lấy từ `@ping/shared` nên không lệch với API. `as const` giữ kiểu khoá
 * i18n là chuỗi literal — `useTranslations` kiểm tra khoá lúc biên dịch.
 */
export const permissionGroups = [
  { labelKey: 'channels', options: [{ bit: Permissions.VIEW_CHANNEL, labelKey: 'viewChannel' }] },
  {
    labelKey: 'messages',
    options: [
      { bit: Permissions.SEND_MESSAGES, labelKey: 'sendMessages' },
      { bit: Permissions.MANAGE_MESSAGES, labelKey: 'manageMessages' },
    ],
  },
  {
    labelKey: 'channelsManage',
    options: [{ bit: Permissions.MANAGE_CHANNELS, labelKey: 'manageChannels' }],
  },
  { labelKey: 'roles', options: [{ bit: Permissions.MANAGE_ROLES, labelKey: 'manageRoles' }] },
  { labelKey: 'members', options: [{ bit: Permissions.KICK_MEMBERS, labelKey: 'kickMembers' }] },
  { labelKey: 'server', options: [{ bit: Permissions.MANAGE_SERVER, labelKey: 'manageServer' }] },
  { labelKey: 'audit', options: [{ bit: Permissions.VIEW_AUDIT_LOG, labelKey: 'viewAuditLog' }] },
  { labelKey: 'admin', options: [{ bit: Permissions.ADMINISTRATOR, labelKey: 'administrator' }] },
] as const;

/** Đọc bitmask của vai trò thành danh sách bit được bật. */
export function permissionsOf(mask: bigint): bigint[] {
  const bits: bigint[] = [];
  for (const group of permissionGroups) {
    for (const option of group.options) {
      if ((mask & option.bit) === option.bit) bits.push(option.bit);
    }
  }
  return bits;
}

/** Gom danh sách bit thành bitmask để gửi API. */
export function maskOf(bits: readonly bigint[]): bigint {
  return bits.reduce((mask, bit) => mask | bit, 0n);
}
