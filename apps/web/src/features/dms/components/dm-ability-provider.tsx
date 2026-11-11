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
  /** Partner của DM — quyết định xem có biết là đang bị chặn hay không. */
  partnerId: string | undefined;
  children: ReactNode;
}) {
  const { data: me } = useMe();
  const blocked = useDmBlockStore(selectDmBlocked(partnerId ?? ''));
  // Ability xây lại khi rule create Message bị rút — composer/pane phản hồi ngay trong phiên.
  const ability = useMemo(() => (me ? dmAbilityFor(me.id, blocked) : null), [me, blocked]);
  if (!ability) return null; // `me` luôn có trong vùng đăng nhập (AuthGate) — chỉ chờ một nhịp.
  return (
    <ServerPermissionContext value={{ serverId: null, ready: true }}>
      <AbilityProvider value={ability}>{children}</AbilityProvider>
    </ServerPermissionContext>
  );
}
