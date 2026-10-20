import { createMongoAbility, subject } from '@casl/ability';
import { defineAbilityFor, type AppAbility, type MyServerPermissions } from '@ping/shared';

export function buildServerAbility(
  userId: string,
  data: MyServerPermissions | undefined,
): AppAbility {
  // Missing data must not use defineAbilityFor(permissions=0), which grants own-message actions.
  return data
    ? defineAbilityFor({ userId, isOwner: data.isOwner, permissions: BigInt(data.permissions) })
    : createMongoAbility<AppAbility>([]);
}

export const messageSubject = (message: { authorId: string }) =>
  subject('Message', { authorId: message.authorId });
