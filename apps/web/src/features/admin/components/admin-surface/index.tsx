'use client';

import type { AbilityContext, MemberDto } from '@ping/shared';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { use, useState } from 'react';
import { useTranslations } from 'use-intl';
import { PingButton } from '@/components/ui/ping-button';
import { PingPopconfirm } from '@/components/ui/ping-popconfirm';
import { pingToast } from '@/components/ui/ping-toast';
import { useMe } from '@/features/auth/hooks';
import { useServerAbility } from '@/features/permissions/context';
import { useServerPermissions } from '@/features/permissions/hooks';
import { useServer } from '@/features/servers/hooks';
import { useErrorMessage } from '@/lib/error-message';
import { useDeleteServer } from '../../hooks';
import { AuditLogTable } from '../audit-log-table';
import { CategoryManager } from '../category-manager';
import { ChannelManager } from '../channel-manager';
import { ServerNameForm } from '../server-name-form';
import { StickerManager } from '../sticker-manager';
import { InviteSection } from './invite-section';
import { MembersSection } from './members-section';
import { RolesSection } from './roles-section';

const MemberDetailsDrawer = dynamic(
  () => import('../member-details-drawer').then((module) => module.MemberDetailsDrawer),
  { ssr: false },
);

export function AdminSurface({ params }: { params: Promise<{ serverId: string }> }) {
  const { serverId } = use(params);
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const { ability } = useServerAbility();
  const { data: permissions } = useServerPermissions(serverId);
  const { data: me } = useMe();
  const { data: server } = useServer(serverId);
  const router = useRouter();
  const errorMessage = useErrorMessage();
  const deleteMutation = useDeleteServer();
  const [member, setMember] = useState<MemberDto | null>(null);

  const canManageRoles = ability.can('manage', 'Role');
  const canViewAudit = ability.can('view', 'AuditLog');
  const canManageServer = ability.can('update', 'Server');
  const canManageChannels = ability.can('manage', 'Channel');
  const canKick = ability.can('delete', 'Member');
  const canManageStickers = ability.can('manage', 'Sticker');
  const isOwner = permissions?.isOwner ?? false;
  const actor: AbilityContext | null =
    permissions && me
      ? {
          userId: me.id,
          isOwner: permissions.isOwner,
          permissions: BigInt(permissions.permissions),
        }
      : null;
  const hasAdminAccess =
    canManageRoles ||
    canViewAudit ||
    canManageServer ||
    canManageChannels ||
    canKick ||
    canManageStickers ||
    isOwner;

  function removeServer() {
    deleteMutation.mutate(serverId, {
      onSuccess: () => {
        pingToast.success(t('serverDeleted'));
        router.replace('/servers');
      },
      onError: (error) => pingToast.error(errorMessage(error)),
    });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto p-6">
      <header>
        <h1 className="text-xl font-semibold">{t('title')}</h1>
        <p className="text-sm text-muted-foreground">{t('hint')}</p>
      </header>

      {canManageServer && <ServerNameForm server={server} />}
      {canManageServer && <InviteSection server={server} />}
      {canManageChannels && <CategoryManager serverId={serverId} />}
      {canManageChannels && <ChannelManager serverId={serverId} />}
      {canManageStickers && <StickerManager serverId={serverId} />}
      <RolesSection serverId={serverId} enabled={canManageRoles} />
      {hasAdminAccess ? (
        <MembersSection
          serverId={serverId}
          server={server}
          actor={actor}
          canKick={canKick}
          onOpen={setMember}
        />
      ) : (
        <p className="text-sm text-muted-foreground">{t('noAccess')}</p>
      )}
      {canViewAudit && (
        <section aria-label={t('audit')} className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{t('audit')}</h2>
          <AuditLogTable serverId={serverId} />
        </section>
      )}
      {isOwner && (
        <section aria-label={t('danger')} className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{t('danger')}</h2>
          <p className="text-sm text-muted-foreground">{t('deleteServerHint')}</p>
          <PingPopconfirm
            title={t('deleteServerTitle')}
            description={t('deleteServerDescription')}
            okText={t('delete')}
            cancelText={tc('cancel')}
            onConfirm={removeServer}
            disabled={deleteMutation.isPending}
          >
            <PingButton variant="danger" loading={deleteMutation.isPending}>
              {t('deleteServer')}
            </PingButton>
          </PingPopconfirm>
        </section>
      )}

      {member && (
        <MemberDetailsDrawer
          key={member.id}
          serverId={serverId}
          ownerId={server.ownerId}
          member={member}
          onClose={() => setMember(null)}
        />
      )}
    </div>
  );
}
