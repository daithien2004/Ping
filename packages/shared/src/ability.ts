import { AbilityBuilder, createMongoAbility } from '@casl/ability';
import type { ForcedSubject, MongoAbility } from '@casl/ability';
import { hasPermission, Permissions } from './permissions';

export type Actions = 'view' | 'create' | 'update' | 'delete' | 'manage';

export type MessageSubject = { authorId: string } & ForcedSubject<'Message'>;

export type Subjects =
  | 'Server'
  | 'Channel'
  | 'Message'
  | 'Reaction'
  | 'Pin'
  | 'Role'
  | 'Member'
  | 'AuditLog'
  | 'all'
  | MessageSubject;

export type AppAbility = MongoAbility<[Actions, Subjects]>;

export interface AbilityContext {
  userId: string;
  isOwner: boolean;
  permissions: bigint;
}

/**
 * Build rules for a verified member of one server. Callers must check membership
 * and ensure the resource belongs to that server before applying these rules.
 */
export function defineAbilityFor(ctx: AbilityContext): AppAbility {
  const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility);
  const has = (flag: bigint) => hasPermission(ctx.permissions, flag);

  if (ctx.isOwner || has(Permissions.ADMINISTRATOR)) {
    can('manage', 'all');
    return build();
  }

  // AbilityFactory chỉ build rules cho người ĐÃ là member (membership bị chặn
  // ở tầng guard) — nên mọi member xem được server và danh sách thành viên
  // mà không cần thêm bit quyền nào.
  can('view', 'Server');
  can('view', 'Member');

  if (has(Permissions.VIEW_CHANNEL)) {
    can('view', 'Channel');
    can('view', 'Message');
    // TG.2: thả cảm xúc cần thấy channel VÀ bit ADD_REACTIONS (ADR-0064).
    if (has(Permissions.ADD_REACTIONS)) {
      can('create', 'Reaction');
    }
  }

  if (has(Permissions.SEND_MESSAGES)) {
    can('create', 'Message');
  }

  can(['update', 'delete'], 'Message', { authorId: ctx.userId });

  if (has(Permissions.MANAGE_MESSAGES)) {
    can('delete', 'Message');
    // TG.3: ghim là hành động quản lý tin (ADR-0066) nhưng vẫn phải thấy channel. Không
    // cấp `update Message` cho MANAGE_MESSAGES — sửa tin của người khác vẫn là của tác giả.
    if (has(Permissions.VIEW_CHANNEL)) {
      can(['create', 'delete'], 'Pin');
    }
  }

  if (has(Permissions.MANAGE_CHANNELS)) {
    can('manage', 'Channel');
  }

  if (has(Permissions.MANAGE_ROLES)) {
    can('manage', 'Role');
  }

  if (has(Permissions.MANAGE_SERVER)) {
    can('update', 'Server');
  }

  if (has(Permissions.KICK_MEMBERS)) {
    can('delete', 'Member');
  }

  // Nhật ký hành động: chỉ role được cấp VIEW_AUDIT_LOG mới xem được (TF.10).
  if (has(Permissions.VIEW_AUDIT_LOG)) {
    can('view', 'AuditLog');
  }

  return build();
}

/**
 * Được đụng tới một tập bit quyền không: cấp nó trong role, sửa/xóa role mang nó,
 * gán role mang nó. CASL không diễn đạt được "tập con bitmask" nên luật nằm ở đây,
 * cạnh defineAbilityFor (ADR-0004).
 *
 * Owner/admin luôn được. Người khác cần MANAGE_ROLES và tập bit phải nằm trong
 * quyền của chính mình — không ai trao được thứ mình không có.
 */
export function canManagePermissions(ctx: AbilityContext, permissions: bigint): boolean {
  if (ctx.isOwner || hasPermission(ctx.permissions, Permissions.ADMINISTRATOR)) {
    return true;
  }
  return (
    hasPermission(ctx.permissions, Permissions.MANAGE_ROLES) &&
    (permissions & ~ctx.permissions) === 0n
  );
}

/**
 * Được kick `target` không (tầng đối tượng, sau khi guard đã xác nhận `delete Member`).
 * Không ai kick được owner hay chính mình (tự rời là `leave`). Owner/admin kick được mọi
 * người còn lại; người khác cần KICK_MEMBERS và chỉ kick được ai có quyền nằm trong quyền mình.
 */
export function canKickMember(actor: AbilityContext, target: AbilityContext): boolean {
  if (target.isOwner || actor.userId === target.userId) {
    return false;
  }
  if (actor.isOwner || hasPermission(actor.permissions, Permissions.ADMINISTRATOR)) {
    return true;
  }
  return (
    hasPermission(actor.permissions, Permissions.KICK_MEMBERS) &&
    (target.permissions & ~actor.permissions) === 0n
  );
}

/** Được đổi role của member `target` không: chỉ owner đụng được owner; còn lại so quyền như trên. */
export function canManageMember(actor: AbilityContext, target: AbilityContext): boolean {
  if (target.isOwner) {
    return actor.isOwner;
  }
  return canManagePermissions(actor, target.permissions);
}
