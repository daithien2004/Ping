import { subject } from '@casl/ability';
import { describe, expect, it } from 'vitest';
import { canKickMember, canManageMember, canManagePermissions, defineAbilityFor } from './ability';
import { Permissions } from './permissions';

const memberPermissions = Permissions.VIEW_CHANNEL | Permissions.SEND_MESSAGES;

describe('defineAbilityFor', () => {
  it('allows members to view channels and messages and create messages', () => {
    const ability = defineAbilityFor({
      userId: 'user-A',
      isOwner: false,
      permissions: memberPermissions,
    });

    expect(ability.can('view', 'Channel')).toBe(true);
    expect(ability.can('view', 'Message')).toBe(true);
    expect(ability.can('create', 'Message')).toBe(true);
    expect(ability.can('manage', 'all')).toBe(false);
  });

  it('does not grant viewing or sending without the corresponding permissions', () => {
    const ability = defineAbilityFor({
      userId: 'user-A',
      isOwner: false,
      permissions: 0n,
    });

    expect(ability.can('view', 'Channel')).toBe(false);
    expect(ability.can('view', 'Message')).toBe(false);
    expect(ability.can('create', 'Message')).toBe(false);
    expect(ability.can('manage', 'all')).toBe(false);
  });

  it('allows updating and deleting own messages but rejects other authors', () => {
    const ability = defineAbilityFor({
      userId: 'user-A',
      isOwner: false,
      permissions: memberPermissions,
    });
    const ownMessage = subject('Message', { authorId: 'user-A' });
    const otherMessage = subject('Message', { authorId: 'user-B' });

    expect(ability.can('update', ownMessage)).toBe(true);
    expect(ability.can('delete', ownMessage)).toBe(true);
    expect(ability.can('update', otherMessage)).toBe(false);
    expect(ability.can('delete', otherMessage)).toBe(false);
  });

  it('allows moderators to delete but not update other authors messages', () => {
    const ability = defineAbilityFor({
      userId: 'moderator-A',
      isOwner: false,
      permissions: memberPermissions | Permissions.MANAGE_MESSAGES,
    });
    const otherMessage = subject('Message', { authorId: 'user-B' });

    expect(ability.can('delete', otherMessage)).toBe(true);
    expect(ability.can('update', otherMessage)).toBe(false);
    expect(ability.can('manage', 'Channel')).toBe(false);
    expect(ability.can('manage', 'Role')).toBe(false);
  });

  it('cho phép người có MANAGE_MESSAGES ghim tin, thành viên thường thì không (TG.3)', () => {
    const moderator = defineAbilityFor({
      userId: 'moderator-A',
      isOwner: false,
      permissions: memberPermissions | Permissions.MANAGE_MESSAGES,
    });
    const plain = defineAbilityFor({
      userId: 'user-A',
      isOwner: false,
      permissions: memberPermissions,
    });

    expect(moderator.can('create', 'Pin')).toBe(true);
    expect(moderator.can('delete', 'Pin')).toBe(true);
    expect(plain.can('create', 'Pin')).toBe(false);
    expect(plain.can('delete', 'Pin')).toBe(false);
    // Ghim KHÔNG mở quyền sửa tin của người khác.
    expect(moderator.can('update', subject('Message', { authorId: 'user-B' }))).toBe(false);
  });

  it('grants server owners all permissions without role permissions', () => {
    const ability = defineAbilityFor({
      userId: 'owner-A',
      isOwner: true,
      permissions: 0n,
    });

    expect(ability.can('manage', 'all')).toBe(true);
    expect(ability.can('delete', 'Server')).toBe(true);
    expect(ability.can('manage', 'Channel')).toBe(true);
    expect(ability.can('manage', 'Role')).toBe(true);
    expect(ability.can('manage', 'Member')).toBe(true);
    expect(ability.can('update', subject('Message', { authorId: 'user-B' }))).toBe(true);
  });

  it('grants administrators all permissions', () => {
    const ability = defineAbilityFor({
      userId: 'admin-A',
      isOwner: false,
      permissions: Permissions.ADMINISTRATOR,
    });

    expect(ability.can('manage', 'all')).toBe(true);
    expect(ability.can('delete', 'Server')).toBe(true);
    expect(ability.can('manage', 'Channel')).toBe(true);
    expect(ability.can('manage', 'Role')).toBe(true);
    expect(ability.can('manage', 'Member')).toBe(true);
    expect(ability.can('update', subject('Message', { authorId: 'user-B' }))).toBe(true);
  });

  it('does not grant role or server management to channel managers', () => {
    const ability = defineAbilityFor({
      userId: 'user-A',
      isOwner: false,
      permissions: Permissions.MANAGE_CHANNELS,
    });

    expect(ability.can('manage', 'Channel')).toBe(true);
    expect(ability.can('manage', 'Role')).toBe(false);
    expect(ability.can('update', 'Server')).toBe(false);
  });

  it('does not grant channel or server management to role managers', () => {
    const ability = defineAbilityFor({
      userId: 'user-A',
      isOwner: false,
      permissions: Permissions.MANAGE_ROLES,
    });

    expect(ability.can('manage', 'Role')).toBe(true);
    expect(ability.can('manage', 'Channel')).toBe(false);
    expect(ability.can('update', 'Server')).toBe(false);
  });

  it('allows server managers to update but not delete the server', () => {
    const ability = defineAbilityFor({
      userId: 'user-A',
      isOwner: false,
      permissions: Permissions.MANAGE_SERVER,
    });

    expect(ability.can('update', 'Server')).toBe(true);
    expect(ability.can('delete', 'Server')).toBe(false);
    expect(ability.can('manage', 'Channel')).toBe(false);
    expect(ability.can('manage', 'Role')).toBe(false);
  });

  it('lets any verified member view the server and its members without extra permissions', () => {
    const ability = defineAbilityFor({
      userId: 'user-A',
      isOwner: false,
      permissions: 0n,
    });

    expect(ability.can('view', 'Server')).toBe(true);
    expect(ability.can('view', 'Member')).toBe(true);
    expect(ability.can('create', 'Message')).toBe(false);
  });

  it('requires VIEW_CHANNEL and ADD_REACTIONS to react (TG.2)', () => {
    const noView = defineAbilityFor({
      userId: 'user-A',
      isOwner: false,
      permissions: Permissions.ADD_REACTIONS,
    });
    const noBit = defineAbilityFor({
      userId: 'user-A',
      isOwner: false,
      permissions: memberPermissions,
    });
    const reactor = defineAbilityFor({
      userId: 'user-A',
      isOwner: false,
      permissions: memberPermissions | Permissions.ADD_REACTIONS,
    });

    expect(noView.can('create', 'Reaction')).toBe(false);
    expect(noBit.can('create', 'Reaction')).toBe(false);
    expect(reactor.can('create', 'Reaction')).toBe(true);
    // Thả cảm xúc không kéo theo quyền sửa/xóa tin của người khác.
    expect(reactor.can('delete', subject('Message', { authorId: 'user-B' }))).toBe(false);
    expect(
      defineAbilityFor({ userId: 'o', isOwner: true, permissions: 0n }).can('create', 'Reaction'),
    ).toBe(true);
  });

  it('only grants the action log to roles with VIEW_AUDIT_LOG (TF.10)', () => {
    const member = defineAbilityFor({
      userId: 'user-A',
      isOwner: false,
      permissions: memberPermissions,
    });
    const auditor = defineAbilityFor({
      userId: 'user-B',
      isOwner: false,
      permissions: memberPermissions | Permissions.VIEW_AUDIT_LOG,
    });
    const owner = defineAbilityFor({ userId: 'user-C', isOwner: true, permissions: 0n });

    expect(member.can('view', 'AuditLog')).toBe(false);
    expect(auditor.can('view', 'AuditLog')).toBe(true);
    // Xem nhật ký không kéo theo quyền quản trị khác.
    expect(auditor.can('manage', 'Role')).toBe(false);
    expect(owner.can('view', 'AuditLog')).toBe(true);
  });
});

describe('canManagePermissions / canManageMember', () => {
  const manager = {
    userId: 'manager',
    isOwner: false,
    permissions: memberPermissions | Permissions.MANAGE_ROLES,
  };
  const owner = { userId: 'owner', isOwner: true, permissions: memberPermissions };
  const admin = { userId: 'admin', isOwner: false, permissions: Permissions.ADMINISTRATOR };

  it('lets a role manager grant only a subset of their own permissions', () => {
    expect(canManagePermissions(manager, Permissions.VIEW_CHANNEL)).toBe(true);
    expect(canManagePermissions(manager, manager.permissions)).toBe(true);
    expect(canManagePermissions(manager, Permissions.ADMINISTRATOR)).toBe(false);
    expect(canManagePermissions(manager, Permissions.MANAGE_CHANNELS)).toBe(false);
  });

  it('requires MANAGE_ROLES even for permissions the member already has', () => {
    const plain = { userId: 'plain', isOwner: false, permissions: memberPermissions };
    expect(canManagePermissions(plain, Permissions.VIEW_CHANNEL)).toBe(false);
  });

  it('lets owners and administrators grant anything', () => {
    expect(canManagePermissions(owner, Permissions.ADMINISTRATOR)).toBe(true);
    expect(canManagePermissions(admin, Permissions.ADMINISTRATOR)).toBe(true);
  });

  it('protects the owner and anyone stronger than the actor', () => {
    expect(canManageMember(manager, owner)).toBe(false);
    expect(canManageMember(admin, owner)).toBe(false);
    expect(canManageMember(owner, owner)).toBe(true);
    expect(canManageMember(manager, admin)).toBe(false);
    expect(
      canManageMember(manager, { userId: 'x', isOwner: false, permissions: memberPermissions }),
    ).toBe(true);
  });
});

describe('kick', () => {
  const kicker = {
    userId: 'kicker',
    isOwner: false,
    permissions: memberPermissions | Permissions.KICK_MEMBERS,
  };
  const plain = { userId: 'plain', isOwner: false, permissions: memberPermissions };
  const owner = { userId: 'owner', isOwner: true, permissions: memberPermissions };
  const admin = { userId: 'admin', isOwner: false, permissions: Permissions.ADMINISTRATOR };

  it('grants delete Member only with KICK_MEMBERS', () => {
    expect(defineAbilityFor(kicker).can('delete', 'Member')).toBe(true);
    expect(defineAbilityFor(plain).can('delete', 'Member')).toBe(false);
  });

  it('lets a kicker remove members whose permissions they cover', () => {
    expect(canKickMember(kicker, plain)).toBe(true);
    expect(canKickMember(plain, kicker)).toBe(false);
  });

  it('never allows kicking the owner, a stronger member, or yourself', () => {
    expect(canKickMember(kicker, owner)).toBe(false);
    expect(canKickMember(admin, owner)).toBe(false);
    expect(canKickMember(kicker, admin)).toBe(false);
    expect(canKickMember(kicker, kicker)).toBe(false);
  });

  it('lets owners and administrators kick anyone but the owner', () => {
    expect(canKickMember(owner, admin)).toBe(true);
    expect(canKickMember(admin, kicker)).toBe(true);
  });
});
