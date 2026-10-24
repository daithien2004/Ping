export const Permissions = {
  VIEW_CHANNEL: 1n,
  SEND_MESSAGES: 2n,
  MANAGE_MESSAGES: 4n,
  MANAGE_CHANNELS: 8n,
  MANAGE_ROLES: 16n,
  MANAGE_SERVER: 32n,
  ADMINISTRATOR: 64n,
  KICK_MEMBERS: 128n,
  /** Xem nhật ký hành động của server (TF.10). Không mặc định cho ai. */
  VIEW_AUDIT_LOG: 256n,
  /** Được ping @everyone/@role trong tin nhắn (T4.1, ADR-0043). Không mặc định cho ai. */
  MENTION_EVERYONE: 512n,
} as const;

export function hasPermission(value: bigint, flag: bigint): boolean {
  const isAdmin = (value & Permissions.ADMINISTRATOR) !== 0n;

  if (isAdmin) {
    return true;
  }

  return (value & flag) === flag;
}
