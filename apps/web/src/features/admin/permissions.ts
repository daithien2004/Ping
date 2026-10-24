import {
  canManageMember,
  canManagePermissions,
  Permissions,
  type AbilityContext,
  type MemberDto,
  type RoleDto,
} from '@ping/shared';

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

/**
 * Quyền hiệu lực của một thành viên: `@everyone` cộng các role đang gắn. `MemberDto` chỉ
 * mang tên role nên phải đối chiếu sang danh sách role (có bitmask) để biết member mạnh
 * hay yếu hơn người đang thao tác — API kiểm tra lại, UI chỉ ẩn/disable cho khớp.
 */
export function effectiveMemberPermissions(member: MemberDto, roles: RoleDto[]): bigint {
  const assigned = new Set(member.roles.map(({ role }) => role.id));
  return roles
    .filter((role) => role.isDefault || assigned.has(role.id))
    .reduce((mask, role) => mask | BigInt(role.permissions), 0n);
}

/** Ngữ cảnh quyền của member đích, dùng chung `canManageMember`/`canManagePermissions` với API. */
export function memberContext(
  member: MemberDto,
  roles: RoleDto[],
  ownerId: string,
): AbilityContext {
  return {
    userId: member.userId,
    isOwner: member.userId === ownerId,
    permissions: effectiveMemberPermissions(member, roles),
  };
}

/** Gán được role này cho member đích không (không tính `@everyone`). */
export function isRoleAssignable(
  actor: AbilityContext,
  target: AbilityContext,
  role: RoleDto,
): boolean {
  return (
    !role.isDefault &&
    canManageMember(actor, target) &&
    canManagePermissions(actor, BigInt(role.permissions))
  );
}

/** Các role hiện trong hộp chọn: bỏ `@everyone` và role vượt quyền người thao tác. */
export function assignableRoles(
  actor: AbilityContext,
  target: AbilityContext,
  roles: RoleDto[],
): RoleDto[] {
  return roles.filter((role) => isRoleAssignable(actor, target, role));
}

/** Vị trí cho role mới: sau role cuối để không nhảy lên đầu danh sách. */
export function nextPosition(roles: RoleDto[]): number {
  return roles.reduce((max, role) => Math.max(max, role.position), -1) + 1;
}

/** Thứ tự hiển thị giống API: position tăng dần, cùng position thì theo tên. */
function byDisplayOrder(a: RoleDto, b: RoleDto): number {
  return a.position - b.position || a.name.localeCompare(b.name);
}

/**
 * Đổi chỗ một role với role liền kề và đánh lại position 0..n-1. Trả về các cập nhật cần
 * gửi API (chỉ role đổi vị trí), hoặc null khi không đổi được: ở biên, role `@everyone`,
 * hoặc định vượt qua `@everyone`. `@everyone` luôn đứng đầu.
 */
export function reorderUpdates(
  roles: RoleDto[],
  roleId: string,
  direction: 'up' | 'down',
): Array<{ id: string; position: number }> | null {
  const ordered = [...roles].sort(byDisplayOrder);
  const index = ordered.findIndex((role) => role.id === roleId);
  if (index < 0) return null;
  const neighbor = direction === 'up' ? index - 1 : index + 1;
  if (neighbor < 0 || neighbor >= ordered.length) return null;
  if (ordered[index].isDefault || ordered[neighbor].isDefault) return null;

  [ordered[index], ordered[neighbor]] = [ordered[neighbor], ordered[index]];
  const before = new Map(roles.map((role) => [role.id, role.position]));
  const updates = ordered
    .map((role, position) => ({ id: role.id, position }))
    .filter((update) => before.get(update.id) !== update.position);
  return updates.length > 0 ? updates : null;
}
