'use client';

import type { AbilityContext, MemberDto, ServerDetail } from '@ping/shared';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/navigation';
import { use, useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { PingButton } from '@/components/ui/ping-button';
import { PingEmpty } from '@/components/ui/ping-empty';
import { PingPopconfirm } from '@/components/ui/ping-popconfirm';
import { PingSelect } from '@/components/ui/ping-select';
import { PingTable, type PingTableColumn } from '@/components/ui/ping-table';
import { pingToast } from '@/components/ui/ping-toast';
import { useMe } from '@/features/auth/hooks';
import { useMembers } from '@/features/members/hooks';
import { useServerAbility } from '@/features/permissions/context';
import { useServerPermissions } from '@/features/permissions/hooks';
import { useServer } from '@/features/servers/hooks';
import { useErrorMessage } from '@/lib/error-message';
import { useDeleteServer, useKickMember, useRegenerateInvite, useRoles } from '../hooks';
import { kickBlockReason, memberContext } from '../permissions';
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
  const isOwner = permissions?.isOwner ?? false;
  const actor: AbilityContext | null =
    permissions && me
      ? {
          userId: me.id,
          isOwner: permissions.isOwner,
          permissions: BigInt(permissions.permissions),
        }
      : null;
  // Không có quyền quản trị nào thì không mở bề mặt quản trị (API vẫn kiểm tra lại).
  const hasAdminAccess =
    canManageRoles || canViewAudit || canManageServer || canManageChannels || canKick || isOwner;

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
      {canManageChannels && <ChannelManager serverId={serverId} />}
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
          serverId={serverId}
          ownerId={server.ownerId}
          member={member}
          onClose={() => setMember(null)}
        />
      )}
    </div>
  );
}

/**
 * Vùng mã mời (T3.6): xem/sao chép mã đang hoạt động và tạo mã mới (vô hiệu mã cũ).
 * `server.inviteCode` là bản sao API đồng bộ lúc regenerate nên hiển thị không cần query riêng.
 */
function InviteSection({ server }: { server: ServerDetail }) {
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const locale = useLocale();
  const errorMessage = useErrorMessage();
  const mutation = useRegenerateInvite(server.id);
  const [expiresInDays, setExpiresInDays] = useState('');

  async function copyCode() {
    await navigator.clipboard.writeText(server.inviteCode);
    pingToast.success(t('inviteCopied'));
  }

  function regenerate() {
    mutation.mutate(
      { expiresInDays: expiresInDays ? Number(expiresInDays) : undefined },
      {
        onSuccess: ({ invite }) => pingToast.success(t('inviteRegenerated', { code: invite.code })),
        onError: (error) => pingToast.error(errorMessage(error)),
      },
    );
  }

  return (
    <section aria-label={t('invite')} className="flex flex-col gap-3" data-testid="invite-section">
      <h2 className="text-lg font-semibold">{t('invite')}</h2>
      <p className="text-sm text-muted-foreground">{t('inviteHint')}</p>
      <div className="flex flex-wrap items-center gap-2">
        <code data-testid="invite-code" className="select-all rounded bg-muted px-2 py-1 text-sm">
          {server.inviteCode}
        </code>
        <span className="text-sm text-muted-foreground">
          {server.inviteExpiresAt
            ? t('inviteExpiresAt', {
                time: new Date(server.inviteExpiresAt).toLocaleString(locale),
              })
            : t('inviteNeverExpires')}
        </span>
        <PingButton
          variant="secondary"
          size="sm"
          aria-label={t('inviteCopy')}
          onClick={() => void copyCode()}
        >
          {t('inviteCopy')}
        </PingButton>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          {t('inviteExpiry')}
          <PingSelect
            aria-label={t('inviteExpiry')}
            className="w-44"
            value={expiresInDays}
            onChange={setExpiresInDays}
            options={[
              { value: '', label: t('inviteExpiryNever') },
              { value: '1', label: t('inviteExpiryDays', { days: 1 }) },
              { value: '7', label: t('inviteExpiryDays', { days: 7 }) },
              { value: '30', label: t('inviteExpiryDays', { days: 30 }) },
            ]}
          />
        </label>
        <PingPopconfirm
          title={t('inviteRegenerateTitle')}
          description={t('inviteRegenerateDescription')}
          okText={t('inviteRegenerate')}
          cancelText={tc('cancel')}
          onConfirm={regenerate}
          disabled={mutation.isPending}
        >
          <PingButton variant="secondary" loading={mutation.isPending}>
            {t('inviteRegenerate')}
          </PingButton>
        </PingPopconfirm>
      </div>
    </section>
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
