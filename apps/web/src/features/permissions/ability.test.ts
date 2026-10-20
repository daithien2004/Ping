import { describe, expect, it } from 'vitest';
import { Permissions } from '@ping/shared';
import { buildServerAbility, messageSubject } from './ability';

describe('web ability from the shared contract', () => {
  it('missing or failed permission data never grants even own-message actions', () => {
    const ability = buildServerAbility('u', undefined);
    expect(ability.can('update', messageSubject({ authorId: 'u' }))).toBe(false);
    expect(ability.can('view', 'Message')).toBe(false);
  });
  it('checks ownership on an actual Message subject and keeps grants independent', () => {
    const ability = buildServerAbility('u', {
      isOwner: false,
      permissions: String(Permissions.VIEW_CHANNEL),
    });
    expect(ability.can('update', messageSubject({ authorId: 'u' }))).toBe(true);
    expect(ability.can('delete', messageSubject({ authorId: 'u' }))).toBe(true);
    expect(ability.can('update', messageSubject({ authorId: 'other' }))).toBe(false);
    expect(ability.can('delete', messageSubject({ authorId: 'other' }))).toBe(false);
    expect(ability.can('create', 'Message')).toBe(false);
    expect(ability.can('create', 'Channel')).toBe(false);
  });
  it('message managers delete others but cannot edit; owner and admin manage everything', () => {
    const other = messageSubject({ authorId: 'other' });
    const moderator = buildServerAbility('u', {
      isOwner: false,
      permissions: String(Permissions.MANAGE_MESSAGES),
    });
    expect(moderator.can('delete', other)).toBe(true);
    expect(moderator.can('update', other)).toBe(false);
    for (const data of [
      { isOwner: true, permissions: '0' },
      { isOwner: false, permissions: String(Permissions.ADMINISTRATOR) },
    ]) {
      const ability = buildServerAbility('u', data);
      expect(ability.can('update', other)).toBe(true);
      expect(ability.can('delete', other)).toBe(true);
      expect(ability.can('create', 'Channel')).toBe(true);
    }
  });
});
