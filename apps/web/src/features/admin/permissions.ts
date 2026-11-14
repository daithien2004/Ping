import {
  canKickMember,
  canManageMember,
  canManagePermissions,
  Permissions,
  type AbilityContext,
  type MemberDto,
  type RoleDto,
} from '@ping/shared';

export interface PermissionOption {
  bit: bigint;
  labelKey: string;
}

export interface PermissionGroup {
  labelKey: string;
  options: readonly PermissionOption[];
}

export const permissionGroups = [
  { labelKey: 'channels', options: [{ bit: Permissions.VIEW_CHANNEL, labelKey: 'viewChannel' }] },
  {
    labelKey: 'messages',
    options: [
      { bit: Permissions.SEND_MESSAGES, labelKey: 'sendMessages' },
      { bit: Permissions.ADD_REACTIONS, labelKey: 'addReactions' },
      { bit: Permissions.MANAGE_MESSAGES, labelKey: 'manageMessages' },
      { bit: Permissions.MENTION_EVERYONE, labelKey: 'mentionEveryone' },
    ],
  },
  {
    labelKey: 'expressions',
    options: [{ bit: Permissions.MANAGE_EXPRESSIONS, labelKey: 'manageExpressions' }],
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

export function permissionsOf(mask: bigint): bigint[] {
  const bits: bigint[] = [];
  for (const group of permissionGroups) {
    for (const option of group.options) {
      if ((mask & option.bit) === option.bit) bits.push(option.bit);
    }
  }
  return bits;
}

export function maskOf(bits: readonly bigint[]): bigint {
  return bits.reduce((mask, bit) => mask | bit, 0n);
}

export function effectiveMemberPermissions(member: MemberDto, roles: RoleDto[]): bigint {
  const assigned = new Set(member.roles.map(({ role }) => role.id));
  return roles
    .filter((role) => role.isDefault || assigned.has(role.id))
    .reduce((mask, role) => mask | BigInt(role.permissions), 0n);
}

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

export type KickBlockReason = 'self' | 'owner' | 'stronger';

export function kickBlockReason(
  actor: AbilityContext,
  target: AbilityContext,
): KickBlockReason | null {
  if (canKickMember(actor, target)) return null;
  if (target.isOwner) return 'owner';
  if (actor.userId === target.userId) return 'self';
  return 'stronger';
}

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

export function assignableRoles(
  actor: AbilityContext,
  target: AbilityContext,
  roles: RoleDto[],
): RoleDto[] {
  return roles.filter((role) => isRoleAssignable(actor, target, role));
}

export function nextPosition(roles: RoleDto[]): number {
  return roles.reduce((max, role) => Math.max(max, role.position), -1) + 1;
}

function byDisplayOrder(a: RoleDto, b: RoleDto): number {
  return a.position - b.position || a.name.localeCompare(b.name);
}

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
