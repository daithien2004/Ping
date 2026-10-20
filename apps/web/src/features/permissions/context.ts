'use client';
import { useAbility } from '@casl/react';
import type { AppAbility } from '@ping/shared';
import { createContext, useContext } from 'react';

export const ServerPermissionContext = createContext<{ serverId: string; ready: boolean } | null>(
  null,
);
export function useServerAbility() {
  const context = useContext(ServerPermissionContext);
  const ability = useAbility<AppAbility>();
  if (!context) throw new Error('ServerAbilityProvider is required');
  return { ...context, ability };
}
