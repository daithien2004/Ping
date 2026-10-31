'use client';

import type { MemberDto } from '@ping/shared';
import { canManageMember } from '@ping/shared';
import { useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { PingButton } from '@/components/ui/ping-button';
import { PingCheckbox } from '@/components/ui/ping-checkbox';
import { PingDrawer } from '@/components/ui/ping-drawer';
import { pingToast } from '@/components/ui/ping-toast';
import { useMe } from '@/features/auth/hooks';
import { useServerAbility } from '@/features/permissions/context';
import { useServerPermissions } from '@/features/permissions/hooks';
import { useErrorMessage } from '@/lib/error-message';
import { useAssignMemberRoles, useRoles } from '../hooks';
import { isRoleAssignable, memberContext } from '../permissions';
import { RoleTag } from './role-tag';

interface Props {
  serverId: string;
  ownerId: string;
  member: MemberDto | null;
  onClose: () => void;
}

/**
 * Chi tiết một thành viên: thông tin cơ bản và gán vai trò (T3.3). Hộp chọn chỉ bật role
 * mà người thao tác có thể cấp (tập con quyền của mình) và chỉ mở khi họ quản được member
 * đích — API vẫn kiểm tra lại, UI chỉ phản ánh trước để tránh bấm rồi nhận 403.
 */
export function MemberDetailsDrawer({ serverId, ownerId, member, onClose }: Props) {
  const t = useTranslations('admin');
  const tm = useTranslations('members');
  const tc = useTranslations('common');
  const locale = useLocale();
  const errorMessage = useErrorMessage();
  const { data: me } = useMe();
  const { ability } = useServerAbility();
  const { data: permissions } = useServerPermissions(serverId);
  const canManageRoles = ability.can('manage', 'Role');
  const rolesQuery = useRoles(serverId, canManageRoles);
  const assignMutation = useAssignMemberRoles(serverId);
  const [selected, setSelected] = useState<string[]>(
    member?.roles.filter(({ role }) => role.id !== undefined).map(({ role }) => role.id) ?? [],
  );

  if (!member) return null;

  const memberId = member.id;
  const name = member.nickname ?? member.user.displayName;
  const roles = rolesQuery.data ?? [];
  const everyone = roles.find((role) => role.isDefault);
  const actor =
    permissions && me
      ? {
          userId: me.id,
          isOwner: permissions.isOwner,
          permissions: BigInt(permissions.permissions),
        }
      : null;
  const target = memberContext(member, roles, ownerId);
  const canManageTarget = actor ? canManageMember(actor, target) : false;
  const assignable = actor
    ? roles.filter((role) => isRoleAssignable(actor, target, role)).map((role) => role.id)
    : [];
  const current = member.roles
    .filter(({ role }) => !roles.find((item) => item.id === role.id)?.isDefault)
    .map(({ role }) => role.id);
  const dirty = selected.length !== current.length || selected.some((id) => !current.includes(id));

  function toggle(roleId: string, checked: boolean) {
    setSelected((current) =>
      checked ? [...new Set([...current, roleId])] : current.filter((id) => id !== roleId),
    );
  }

  function save() {
    assignMutation.mutate(
      { memberId, roleIds: selected },
      {
        onSuccess: () => {
          pingToast.success(t('memberRolesSaved'));
          onClose();
        },
        onError: (error) => pingToast.error(errorMessage(error)),
      },
    );
  }

  return (
    <PingDrawer open={member !== null} onClose={onClose} title={t('memberDetails')}>
      <dl className="flex flex-col gap-3 text-sm">
        <div>
          <dt className="text-muted-foreground">{t('memberName')}</dt>
          <dd>{name}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('memberUsername')}</dt>
          <dd>@{member.user.username}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('memberRoles')}</dt>
          <dd className="flex flex-wrap gap-1">
            {member.roles.length === 0 ? (
              <span className="text-muted-foreground">{t('noRoles')}</span>
            ) : (
              member.roles.map(({ role }, index) => (
                <RoleTag key={role.id} name={role.name} position={index} />
              ))
            )}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('memberStatus')}</dt>
          <dd>{member.online ? tm('statusOnline') : tm('statusOffline')}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{t('memberJoinedAt')}</dt>
          <dd>{new Date(member.joinedAt).toLocaleDateString(locale)}</dd>
        </div>
      </dl>

      {canManageRoles && (
        <section aria-label={t('assignRoles')} className="mt-6 flex flex-col gap-3">
          <div>
            <h3 className="text-sm font-semibold">{t('assignRoles')}</h3>
            <p className="text-xs text-muted-foreground">{t('assignRolesHint')}</p>
          </div>

          {rolesQuery.isPending && <p className="text-sm text-muted-foreground">{tc('loading')}</p>}
          {rolesQuery.isError && (
            <p role="alert" className="text-sm text-destructive">
              {t('rolesLoadFailed')}
            </p>
          )}
          {!permissions && <p className="text-sm text-muted-foreground">{tc('loading')}</p>}
          {permissions && !canManageTarget && (
            <p role="alert" className="text-sm text-destructive">
              {t('cannotManageMember')}
            </p>
          )}

          {rolesQuery.data && (
            <div className="flex flex-col gap-2">
              {everyone && (
                <PingCheckbox checked disabled>
                  {everyone.name} — {t('everyoneAlways')}
                </PingCheckbox>
              )}
              {roles
                .filter((role) => !role.isDefault)
                .map((role) => {
                  const allowed = assignable.includes(role.id);
                  return (
                    <PingCheckbox
                      key={role.id}
                      checked={selected.includes(role.id)}
                      disabled={!canManageTarget || !allowed || assignMutation.isPending}
                      onChange={(event) => toggle(role.id, event.target.checked)}
                    >
                      {role.name}
                      {!allowed && canManageTarget ? ` — ${t('roleAboveYou')}` : ''}
                    </PingCheckbox>
                  );
                })}
            </div>
          )}

          {rolesQuery.data && canManageTarget && (
            <PingButton
              onClick={save}
              loading={assignMutation.isPending}
              disabled={!dirty || assignMutation.isPending}
            >
              {tc('save')}
            </PingButton>
          )}
        </section>
      )}
    </PingDrawer>
  );
}
