import { hasPermission, Permissions, type AbilityContext } from '@ping/shared';
import type { Prisma } from '../../generated/prisma/client.js';
import type { MentionTokens } from './mention-parser.js';

/** Một hàng MessageMention cần ghi (messageId do nơi gọi điền). */
export type MentionRow =
  | { kind: 'user'; mentionedMemberId: string; roleId?: undefined }
  | { kind: 'role'; roleId: string; mentionedMemberId?: undefined }
  | { kind: 'everyone'; mentionedMemberId?: undefined; roleId?: undefined };

/**
 * Giải nghĩa token mention thành hàng MessageMention (T4.1, ADR-0043).
 *
 * Thứ tự: `@everyone` → username của thành viên server → tên role (role `@everyone` mặc định
 * không tính — nhắc nó đã là `@everyone`). Token trùng cả username lẫn tên role chỉ tính làm
 * mention user. `MENTION_EVERYONE` (owner/ADMINISTRATOR ngầm có) chặn @everyone và @role:
 * thiếu bit thì hai loại này không được ghi, nhưng mention user vẫn nhận.
 */
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
