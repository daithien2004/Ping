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
  | 'Attachment'
  | 'Sticker'
  | 'Role'
  | 'Member'
  | 'ServerBan'
  | 'AuditLog'
  | 'all'
  | MessageSubject;

export type AppAbility = MongoAbility<[Actions, Subjects]>;

export interface AbilityContext {
  userId: string;
  isOwner: boolean;
  permissions: bigint;
}

/** DM: không có MANAGE_MESSAGES; chỉ tác giả sửa/xóa tin của mình. */
export function defineDmAbilityFor(userId: string): AppAbility {
  const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility);
  can('view', 'Message');
  can('view', 'Attachment');
  can('create', 'Message');
  can('create', 'Attachment');
  can('create', 'Reaction');
  can(['update', 'delete'], 'Message', { authorId: userId });
  can(['create', 'delete'], 'Pin');
  return build();
}

/** Callers must check membership and that the resource belongs to the server first. */
export function defineAbilityFor(ctx: AbilityContext): AppAbility {
  const { can, build } = new AbilityBuilder<AppAbility>(createMongoAbility);
  const has = (flag: bigint) => hasPermission(ctx.permissions, flag);

  if (ctx.isOwner || has(Permissions.ADMINISTRATOR)) {
    can('manage', 'all');
    return build();
  }

  can('view', 'Server');
  can('view', 'Member');
  can('view', 'Sticker');

  if (has(Permissions.VIEW_CHANNEL)) {
    can('view', 'Channel');
    can('view', 'Message');
    can('view', 'Attachment');
    if (has(Permissions.SEND_MESSAGES)) can('create', 'Attachment');
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

  if (has(Permissions.MANAGE_EXPRESSIONS)) {
    can('manage', 'Sticker');
  }

  if (has(Permissions.KICK_MEMBERS)) {
    can('delete', 'Member');
    // Ban/unban dùng bit KICK_MEMBERS, không có bit BAN_MEMBERS riêng.
    can(['create', 'delete', 'view'], 'ServerBan');
  }

  if (has(Permissions.CHANGE_NICKNAME)) {
    can('update', 'Member');
  }

  if (has(Permissions.VIEW_AUDIT_LOG)) {
    can('view', 'AuditLog');
  }

  return build();
}

/** Owner/admin luôn được; người khác cần MANAGE_ROLES và chỉ trao bit mình có. */
export function canManagePermissions(ctx: AbilityContext, permissions: bigint): boolean {
  if (ctx.isOwner || hasPermission(ctx.permissions, Permissions.ADMINISTRATOR)) {
    return true;
  }
  return (
    hasPermission(ctx.permissions, Permissions.MANAGE_ROLES) &&
    (permissions & ~ctx.permissions) === 0n
  );
}

/** Không ai kick được owner hay chính mình (tự rời là `leave`). */
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

export function canManageMember(actor: AbilityContext, target: AbilityContext): boolean {
  if (target.isOwner) {
    return actor.isOwner;
  }
  return canManagePermissions(actor, target.permissions);
}
