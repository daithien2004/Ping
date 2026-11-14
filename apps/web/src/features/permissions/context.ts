'use client';
import { useAbility } from '@casl/react';
import type { AppAbility } from '@ping/shared';
import { createContext, useContext } from 'react';

/**
 * Quyền của vùng đang xem. `serverId` là `null` trong DM (ADR-0070): DM không thuộc server nào,
 * nên các query theo server tự tắt thay vì chạy với một id rỗng giả.
 */
export const ServerPermissionContext = createContext<{
  serverId: string | null;
  ready: boolean;
} | null>(null);

export function useServerAbility() {
  const context = useContext(ServerPermissionContext);
  const ability = useAbility<AppAbility>();
  if (!context) throw new Error('ServerAbilityProvider is required');
  return { ...context, ability };
}

export function useCurrentServerId(): string {
  const { serverId } = useServerAbility();
  if (serverId === null) throw new Error('useCurrentServerId chỉ dùng trong vùng server');
  return serverId;
}
