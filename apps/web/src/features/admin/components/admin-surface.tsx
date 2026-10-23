'use client';

import type { MemberDto } from '@ping/shared';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { use, useState } from 'react';
import { useTranslations } from 'use-intl';
import { PingButton } from '@/components/ui/ping-button';
import { PingEmpty } from '@/components/ui/ping-empty';
import { PingPopconfirm } from '@/components/ui/ping-popconfirm';
import { PingTable, type PingTableColumn } from '@/components/ui/ping-table';
import { pingToast } from '@/components/ui/ping-toast';
import { useMembers } from '@/features/members/hooks';
import { useServerAbility } from '@/features/permissions/context';
import { useServerPermissions } from '@/features/permissions/hooks';
import { useServer } from '@/features/servers/hooks';
import { useErrorMessage } from '@/lib/error-message';
import { useDeleteServer, useRoles } from '../hooks';
import { AuditLogTable } from './audit-log-table';
import { ChannelManager } from './channel-manager';
import { RoleEditor } from './role-editor';
import { RoleTag } from './role-tag';
import { ServerNameForm } from './server-name-form';

// Drawer chỉ cần khi mở chi tiết một thành viên: tách khỏi chunk của trang cài đặt và chỉ tải
// khi thực sự mở (giữ bundle ban đầu theo ngân sách, xem ADR-0058).
const MemberDetailsDrawer = dynamic(
  () => import('./member-details-drawer').then((module) => module.MemberDetailsDrawer),
  { ssr: false },
);

/**
 * Bề mặt quản trị của server (TF.10): vai trò và quyền, thành viên, nhật ký hành động và
 * vùng nguy hiểm — tất cả dựng bằng bộ `Ping*`.
 *
 * Mỗi mục chỉ hiện khi người dùng có quyền tương ứng; API vẫn kiểm tra lại nên giao diện
 * không phải là hàng rào bảo mật.
 */
export function AdminSurface({ params }: { params: Promise<{ serverId: string }> }) {
  const { serverId } = use(params);
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const { ability } = useServerAbility();
  const { data: permissions } = useServerPermissions(serverId);
  const { data: server } = useServer(serverId);
  const router = useRouter();
  const errorMessage = useErrorMessage();
  const deleteMutation = useDeleteServer();
  const [member, setMember] = useState<MemberDto | null>(null);

  const canManageRoles = ability.can('manage', 'Role');
  const canViewAudit = ability.can('view', 'AuditLog');
  const canManageServer = ability.can('update', 'Server');
  const canManageChannels = ability.can('manage', 'Channel');
  const isOwner = permissions?.isOwner ?? false;
  // Không có quyền quản trị nào thì không mở bề mặt quản trị (API vẫn kiểm tra lại).
  const hasAdminAccess =
    canManageRoles || canViewAudit || canManageServer || isOwner || canManageChannels;

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
      {canManageChannels && <ChannelManager serverId={serverId} />}
      <RolesSection serverId={serverId} enabled={canManageRoles} />
      {hasAdminAccess ? (
        <MembersSection serverId={serverId} onOpen={setMember} />
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

      {member && <MemberDetailsDrawer member={member} onClose={() => setMember(null)} />}
    </div>
  );
}

function RolesSection({ serverId, enabled }: { serverId: string; enabled: boolean }) {
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const query = useRoles(serverId, enabled);
  if (!enabled) return null;

  return (
    <section aria-label={t('roles')} className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{t('roles')}</h2>
      {query.isPending && <p className="text-sm text-muted-foreground">{tc('loading')}</p>}
      {query.isError && (
        <p role="alert" className="text-sm text-destructive">
          {t('rolesLoadFailed')}
        </p>
      )}
      {query.data && <RoleEditor serverId={serverId} roles={query.data} />}
    </section>
  );
}

function MembersSection({
  serverId,
  onOpen,
}: {
  serverId: string;
  onOpen: (member: MemberDto) => void;
}) {
  const t = useTranslations('admin');
  const query = useMembers(serverId);
  const members = query.data?.pages.flatMap((page) => page.members) ?? [];

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
      key: 'details',
      header: t('memberActions'),
      render: (row) => (
        <PingButton variant="secondary" size="sm" onClick={() => onOpen(row)}>
          {t('memberDetails')}
        </PingButton>
      ),
    },
  ];

  return (
    <section aria-label={t('members')} className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{t('members')}</h2>
      <PingTable
        label={t('members')}
        columns={columns}
        rows={members}
        rowKey={(row) => row.id}
        loading={query.isPending}
        empty={<PingEmpty description={t('membersEmpty')} />}
      />
    </section>
  );
}
