import { AbilityBuilder, createMongoAbility } from '@casl/ability';
import type { ForcedSubject, MongoAbility } from '@casl/ability';
import { hasPermission, Permissions } from './permissions';

export type Actions = 'view' | 'create' | 'update' | 'delete' | 'manage';

export type MessageSubject = { authorId: string } & ForcedSubject<'Message'>;

export type Subjects =
  'Server' | 'Channel' | 'Message' | 'Role' | 'Member' | 'all' | MessageSubject;

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
  }

  if (has(Permissions.SEND_MESSAGES)) {
    can('create', 'Message');
  }

  can(['update', 'delete'], 'Message', { authorId: ctx.userId });

  if (has(Permissions.MANAGE_MESSAGES)) {
    can('delete', 'Message');
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

  return build();
}
