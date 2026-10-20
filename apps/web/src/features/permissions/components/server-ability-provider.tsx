'use client';
import { AbilityProvider } from '@casl/react';
import { use, useMemo, type ReactNode } from 'react';
import { useTranslations } from 'use-intl';
import { useMe } from '@/features/auth/hooks';
import { Button } from '@/components/ui/button';
import { Loading } from '@/components/loading';
import { useErrorMessage } from '@/lib/error-message';
import { buildServerAbility } from '../ability';
import { ServerPermissionContext, useServerAbility } from '../context';
import { useServerPermissions } from '../hooks';

export function ServerAbilityProvider({
  params,
  children,
}: {
  params: Promise<{ serverId: string }>;
  children: ReactNode;
}) {
  const { serverId } = use(params);
  return (
    <AbilityScope key={serverId} serverId={serverId}>
      {children}
    </AbilityScope>
  );
}

function AbilityScope({ serverId, children }: { serverId: string; children: ReactNode }) {
  const { data: me } = useMe();
  const query = useServerPermissions(serverId);
  const t = useTranslations('common');
  const errorMessage = useErrorMessage();
  const ability = useMemo(
    () => buildServerAbility(me!.id, query.isError ? undefined : query.data),
    [me, query.data, query.isError],
  );
  if (query.isError)
    return (
      <div role="alert" className="m-auto flex flex-col items-center gap-3">
        <p>{errorMessage(query.error)}</p>
        <Button onClick={() => void query.refetch()}>{t('retry')}</Button>
      </div>
    );
  if (!query.data) return <Loading />;
  return (
    <ServerPermissionContext value={{ serverId, ready: query.isSuccess && !query.isFetching }}>
      <AbilityProvider value={ability}>{children}</AbilityProvider>
    </ServerPermissionContext>
  );
}

/** Read access and action readiness differ: a background refresh locks actions, preserving drafts. */
export function ServerViewBoundary({ children }: { children: ReactNode }) {
  const { ability } = useServerAbility();
  const t = useTranslations('errors');
  return ability.can('view', 'Message') ? (
    children
  ) : (
    <p role="alert" className="m-auto text-sm text-muted-foreground">
      {t('FORBIDDEN')}
    </p>
  );
}
