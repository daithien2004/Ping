'use client';

import { useTranslations } from 'use-intl';
import { PingButton } from '@/components/ui/ping-button';
import { useRoles } from '../../hooks';
import { RoleEditor } from '../role-editor';

export function RolesSection({ serverId, enabled }: { serverId: string; enabled: boolean }) {
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const query = useRoles(serverId, enabled);
  if (!enabled) return null;

  return (
    <section aria-label={t('roles')} className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{t('roles')}</h2>
      {query.isPending && <p className="text-sm text-muted-foreground">{tc('loading')}</p>}
      {query.isError && (
        <div role="alert" className="flex flex-col items-start gap-2 text-sm text-destructive">
          <p>{t('rolesLoadFailed')}</p>
          <PingButton
            variant="secondary"
            size="sm"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            {tc('retry')}
          </PingButton>
        </div>
      )}
      {query.data && <RoleEditor serverId={serverId} roles={query.data} />}
    </section>
  );
}
