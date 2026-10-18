import { subject } from '@casl/ability';
import { describe, expect, it } from 'vitest';
import { defineAbilityFor } from './ability';
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
});
