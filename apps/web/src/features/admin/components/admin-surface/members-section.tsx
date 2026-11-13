'use client';

import type { AbilityContext, MemberDto, ServerDetail } from '@ping/shared';
import { useTranslations } from 'use-intl';
import { PingButton } from '@/components/ui/ping-button';
import { PingEmpty } from '@/components/ui/ping-empty';
import { PingPopconfirm } from '@/components/ui/ping-popconfirm';
import { PingTable, type PingTableColumn } from '@/components/ui/ping-table';
import { pingToast } from '@/components/ui/ping-toast';
import { useMembers } from '@/features/members/hooks';
import { useErrorMessage } from '@/lib/error-message';
import { useKickMember } from '../../hooks';
import { kickBlockReason, memberContext } from '../../permissions';
import { RoleTag } from '../role-tag';

export function MembersSection({
  serverId,
  server,
  actor,
  canKick,
  onOpen,
}: {
  serverId: string;
  server: ServerDetail;
  actor: AbilityContext | null;
  canKick: boolean;
  onOpen: (member: MemberDto) => void;
}) {
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const errorMessage = useErrorMessage();
  const query = useMembers(serverId);
  const kickMutation = useKickMember(serverId);
  const members = query.data?.pages.flatMap((page) => page.members) ?? [];

  const reasonOf = {
    self: t('kickReasonSelf'),
    owner: t('kickReasonOwner'),
    stronger: t('kickReasonStronger'),
  } as const;

  function kick(row: MemberDto) {
    kickMutation.mutate(row.id, {
      onSuccess: () => pingToast.success(t('memberKicked')),
      onError: (error) => pingToast.error(errorMessage(error)),
    });
  }

  const columns: PingTableColumn<MemberDto>[] = [
    {
      key: 'name',
      header: t('memberName'),
      render: (row) => row.nickname ?? row.user.displayName,
    },
    {
      key: 'roles',
      header: t('memberRoles'),
      render: (row) =>
        row.roles.length === 0 ? (
          <span className="text-muted-foreground">{t('noRoles')}</span>
        ) : (
          <span className="flex flex-wrap gap-1">
            {row.roles.map(({ role }, index) => (
              <RoleTag key={role.id} name={role.name} position={index} />
            ))}
          </span>
        ),
    },
    {
      key: 'actions',
      header: t('memberActions'),
      render: (row) => {
        const name = row.nickname ?? row.user.displayName;
        // Thứ bậc tính từ quyền hiệu lực (role của server + @everyone), khớp API (ADR-0004).
        const blocked = actor
          ? kickBlockReason(actor, memberContext(row, server.roles, server.ownerId))
          : null;
        const label = blocked
          ? t('kickBlocked', { name, reason: reasonOf[blocked] })
          : t('kickMember', { name });
        return (
          <div className="flex items-center gap-2">
            <PingButton variant="secondary" size="sm" onClick={() => onOpen(row)}>
              {t('memberDetails')}
            </PingButton>
            {canKick && (
              <PingPopconfirm
                title={t('kickTitle', { name })}
                description={t('kickDescription')}
                okText={t('kick')}
                cancelText={tc('cancel')}
                onConfirm={() => kick(row)}
                disabled={blocked !== null || kickMutation.isPending}
              >
                <PingButton
                  variant="danger"
                  size="sm"
                  aria-label={label}
                  disabled={blocked !== null || kickMutation.isPending}
                  loading={kickMutation.isPending && kickMutation.variables === row.id}
                >
                  {t('kick')}
                </PingButton>
              </PingPopconfirm>
            )}
          </div>
        );
      },
    },
  ];

  return (
    <section aria-label={t('members')} className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{t('members')}</h2>
      {query.isError && (
        <div role="alert" className="flex flex-col items-start gap-2 text-sm text-destructive">
          <p>{errorMessage(query.error)}</p>
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
      <PingTable
        label={t('members')}
        columns={columns}
        rows={query.isError ? [] : members}
        rowKey={(row) => row.id}
        loading={query.isPending}
        empty={query.isError ? null : <PingEmpty description={t('membersEmpty')} />}
      />
    </section>
  );
}
