import { describe, expect, it } from 'vitest';
import { hasPermission, Permissions } from './permissions';

describe('hasPermission', () => {
  it('returns false when no permissions are granted', () => {
    expect(hasPermission(0n, Permissions.SEND_MESSAGES)).toBe(false);
  });

  it('returns true when the requested permission is granted', () => {
    expect(hasPermission(Permissions.SEND_MESSAGES, Permissions.SEND_MESSAGES)).toBe(true);
  });

  it('rejects a permission that was not granted', () => {
    expect(hasPermission(Permissions.VIEW_CHANNEL, Permissions.MANAGE_MESSAGES)).toBe(false);
  });

  it('checks individual permissions in a combined bitfield', () => {
    const permissions = Permissions.VIEW_CHANNEL | Permissions.SEND_MESSAGES;

    expect(hasPermission(permissions, Permissions.VIEW_CHANNEL)).toBe(true);
    expect(hasPermission(permissions, Permissions.SEND_MESSAGES)).toBe(true);
    expect(hasPermission(permissions, Permissions.MANAGE_MESSAGES)).toBe(false);
  });

  it('allows administrators to use permissions not explicitly granted', () => {
    expect(hasPermission(Permissions.ADMINISTRATOR, Permissions.MANAGE_CHANNELS)).toBe(true);
  });

  it('rejects a combined request when one required permission is missing', () => {
    const required = Permissions.VIEW_CHANNEL | Permissions.SEND_MESSAGES;

    expect(hasPermission(Permissions.VIEW_CHANNEL, required)).toBe(false);
  });

  it('allows a combined request when all required permissions are granted', () => {
    const required = Permissions.VIEW_CHANNEL | Permissions.SEND_MESSAGES;

    expect(hasPermission(required, required)).toBe(true);
  });
});
