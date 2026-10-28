'use client';

import { AbilityProvider } from '@casl/react';
import { defineDmAbilityFor, type AppAbility } from '@ping/shared';
import { createMongoAbility } from '@casl/ability';
import { useMemo, type ReactNode } from 'react';
import { useMe } from '@/features/auth/hooks';
import { ServerPermissionContext } from '@/features/permissions/context';
import { selectDmBlocked, useDmBlockStore } from '../store';

/**
 * Quyền trong DM (TG.9, ADR-0070): luật chat của participant định nghĩa MỘT NƠI ở
 * `defineDmAbilityFor` (packages/shared, cạnh defineAbilityFor) — client chỉ dựng ability từ
 * đó. Cách này cho phép tái dùng nguyên `MessagePane`/`MessageComposer` (chúng đọc
 * `useServerAbility`) mà không phải rẽ nhánh theo server/DM trong từng component tin nhắn.
 *
 * Khi biết là đang bị chặn hai chiều (mình vừa chặn, hoặc 403 `DM_BLOCKED` khi gửi) thì bỏ
 * rule `create Message` để composer tự về trạng thái không gửi được qua đúng luồng ability
 * có sẵn — vẫn đọc được tin cũ (mục 4 của ADR). `serverId: ''` chỉ là sentinel: mọi query
 * theo server (emoji tùy chỉnh, quyền server) đều disable với giá trị rỗng này.
 */
const withoutCreateMessage = (ability: AppAbility): AppAbility =>
  createMongoAbility<AppAbility>(
    ability.rules.filter((rule) => !(rule.action === 'create' && rule.subject === 'Message')),
  );

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
  const ability = useMemo(
    () =>
      me
        ? blocked
          ? withoutCreateMessage(defineDmAbilityFor(me.id))
          : defineDmAbilityFor(me.id)
        : null,
    [me, blocked],
  );
  if (!ability) return null; // `me` luôn có trong vùng đăng nhập (AuthGate) — chỉ chờ một nhịp.
  return (
    <ServerPermissionContext value={{ serverId: '', ready: true }}>
      <AbilityProvider value={ability}>{children}</AbilityProvider>
    </ServerPermissionContext>
  );
}
