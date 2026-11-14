import { hasPermission, Permissions, type AbilityContext } from '@ping/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import type { MentionTokens } from './mention-parser.js';

export type MentionRow =
  | { kind: 'user'; mentionedMemberId: string; roleId?: undefined }
  | { kind: 'role'; roleId: string; mentionedMemberId?: undefined }
  | { kind: 'everyone'; mentionedMemberId?: undefined; roleId?: undefined };

// Thứ tự: @everyone → username → tên role (role @everyone mặc định không tính); trùng cả hai chỉ tính user.
// Thiếu MENTION_EVERYONE thì @everyone/@role không ghi, mention user vẫn nhận.
export async function resolveMentions(
  db: Prisma.TransactionClient,
  serverId: string,
  actor: AbilityContext,
  tokens: MentionTokens,
): Promise<MentionRow[]> {
  const rows: MentionRow[] = [];

  const members =
    tokens.names.length > 0
      ? await db.member.findMany({
          where: { serverId, user: { username: { in: tokens.names } } },
          select: { id: true, user: { select: { username: true } } },
        })
      : [];
  const memberByName = new Map(members.map((member) => [member.user.username, member.id]));
  for (const name of tokens.names) {
    const memberId = memberByName.get(name);
    if (memberId) rows.push({ kind: 'user', mentionedMemberId: memberId });
  }

  const canPingGroups =
    actor.isOwner || hasPermission(actor.permissions, Permissions.MENTION_EVERYONE);
  if (!canPingGroups) return rows;

  if (tokens.everyone) rows.push({ kind: 'everyone' });

  const unresolved = tokens.names.filter((name) => !memberByName.has(name));
  if (unresolved.length > 0) {
    const roles = await db.role.findMany({
      where: { serverId, name: { in: unresolved }, isDefault: false },
      select: { id: true, name: true },
    });
    for (const role of roles) rows.push({ kind: 'role', roleId: role.id });
  }
  return rows;
}
