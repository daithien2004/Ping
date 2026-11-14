'use client';

import { AbilityProvider } from '@casl/react';
import { useMemo, type ReactNode } from 'react';
import { useMe } from '@/features/auth/hooks';
import { ServerPermissionContext } from '@/features/permissions/context';
import { dmAbilityFor } from '../dm-ability';
import { selectDmBlocked, useDmBlockStore } from '../store';

/**
 * Quyền trong DM (TG.9, ADR-0070): cấp ability của participant cho cây con, để tái dùng nguyên
 * `MessagePane`/`MessageComposer` (chúng đọc `useServerAbility`) mà không phải rẽ nhánh theo
 * server/DM trong từng component tin nhắn. Luật nằm ở `dmAbilityFor` (hàm thuần, có test).
 *
 * `serverId: null` nói rõ "không thuộc server nào": các query theo server (emoji tùy chỉnh,
 * quyền server) tự tắt thay vì chạy với một id rỗng giả.
 */
export function DmAbilityProvider({
  partnerId,
  children,
}: {
  partnerId: string | undefined;
  children: ReactNode;
}) {
  const { data: me } = useMe();
  const blocked = useDmBlockStore(selectDmBlocked(partnerId ?? ''));
  const ability = useMemo(() => (me ? dmAbilityFor(me.id, blocked) : null), [me, blocked]);
  if (!ability) return null;
  return (
    <ServerPermissionContext value={{ serverId: null, ready: true }}>
      <AbilityProvider value={ability}>{children}</AbilityProvider>
    </ServerPermissionContext>
  );
}
