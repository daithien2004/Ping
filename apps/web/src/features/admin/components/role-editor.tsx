'use client';

import type { RoleDto } from '@ping/shared';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { PingButton } from '@/components/ui/ping-button';
import { PingForm, PingFormItem, usePingForm } from '@/components/ui/ping-form';
import { PingIconButton } from '@/components/ui/ping-icon-button';
import { PingInput } from '@/components/ui/ping-input';
import { PingPopconfirm } from '@/components/ui/ping-popconfirm';
import { PingTable, type PingTableColumn } from '@/components/ui/ping-table';
import { pingToast } from '@/components/ui/ping-toast';
import { useErrorMessage } from '@/lib/error-message';
import { useDeleteRole, useReorderRoles, useUpdateRole } from '../hooks';
import { maskOf, permissionsOf, reorderUpdates } from '../permissions';
import { PermissionGroupEditor } from './permission-group-editor';
import { RoleCreateDialog } from './role-create-dialog';
import { RoleTag } from './role-tag';

interface Props {
  serverId: string;
  roles: RoleDto[];
}

/**
 * Trình sửa vai trò (TF.10 + T3.3): bảng vai trò theo thứ tự hiển thị, tạo vai trò mới,
 * chọn một vai trò để sửa tên/quyền, đổi thứ tự bằng nút lên/xuống, xoá có xác nhận.
 *
 * Thứ tự chỉ quyết định cách hiển thị (và màu role); thẩm quyền vẫn theo bit quyền —
 * xem ADR-0004 và ghi chú dưới bảng.
 */
export function RoleEditor({ serverId, roles }: Props) {
  const t = useTranslations('admin');
  const errorMessage = useErrorMessage();
  const reorderMutation = useReorderRoles(serverId);
  const [selectedId, setSelectedId] = useState<string | undefined>(roles[0]?.id);
  const [createOpen, setCreateOpen] = useState(false);
  const ordered = [...roles].sort(
    (a, b) => a.position - b.position || a.name.localeCompare(b.name),
  );
  const selected = ordered.find((role) => role.id === selectedId) ?? ordered[0];

  function move(roleId: string, direction: 'up' | 'down') {
    const updates = reorderUpdates(roles, roleId, direction);
    if (!updates) return;
    reorderMutation.mutate(updates, {
      onError: (error) => pingToast.error(errorMessage(error)),
    });
  }

  const columns: PingTableColumn<RoleDto>[] = [
    {
      key: 'name',
      header: t('roleName'),
      render: (role) => <RoleTag name={role.name} position={role.position} />,
    },
    {
      key: 'permissions',
      header: t('rolePermissions'),
      render: (role) =>
        t('rolePermissionCount', { count: permissionsOf(BigInt(role.permissions)).length }),
    },
    { key: 'members', header: t('roleMembers'), render: (role) => role.memberCount ?? 0 },
    {
      key: 'order',
      header: t('roleOrder'),
      width: 120,
      render: (role) => (
        <div className="flex items-center gap-1">
          <PingIconButton
            aria-label={t('moveUp', { name: role.name })}
            icon={<ChevronUp size={16} />}
            disabled={reorderMutation.isPending || !reorderUpdates(roles, role.id, 'up')}
            onClick={() => move(role.id, 'up')}
          />
          <PingIconButton
            aria-label={t('moveDown', { name: role.name })}
            icon={<ChevronDown size={16} />}
            disabled={reorderMutation.isPending || !reorderUpdates(roles, role.id, 'down')}
            onClick={() => move(role.id, 'down')}
          />
        </div>
      ),
    },
    {
      key: 'actions',
      header: t('roleActions'),
      render: (role) => (
        <PingButton variant="secondary" size="sm" onClick={() => setSelectedId(role.id)}>
          {t('edit')}
        </PingButton>
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-muted-foreground">{t('roleOrderHint')}</p>
        <PingButton size="sm" onClick={() => setCreateOpen(true)}>
          {t('roleCreate')}
        </PingButton>
      </div>
      <PingTable
        label={t('roles')}
        columns={columns}
        rows={ordered}
        rowKey={(role) => role.id}
        empty={t('rolesEmpty')}
      />
      {selected ? (
        // key = id của vai trò: đổi vai trò thì form và trạng thái quyền khởi tạo lại.
        <RoleForm key={selected.id} serverId={serverId} role={selected} />
      ) : (
        <p className="text-sm text-muted-foreground">{t('rolesEmpty')}</p>
      )}
      <RoleCreateDialog
        serverId={serverId}
        roles={roles}
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />
      <p className="text-xs text-muted-foreground">{t('roleOrderAuthorityHint')}</p>
    </div>
  );
}

function RoleForm({ serverId, role }: { serverId: string; role: RoleDto }) {
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const errorMessage = useErrorMessage();
  const [form] = usePingForm<{ name: string }>();
  const [mask, setMask] = useState<bigint>(BigInt(role.permissions));
  const updateMutation = useUpdateRole(serverId);
  const deleteMutation = useDeleteRole(serverId);

  function save(values: { name?: string }) {
    const name = values.name?.trim() || role.name;
    updateMutation.mutate(
      { roleId: role.id, name, permissions: maskOf(permissionsOf(mask)).toString() },
      {
        onSuccess: () => pingToast.success(t('roleSaved')),
        onError: (error) => pingToast.error(errorMessage(error)),
      },
    );
  }

  function remove() {
    deleteMutation.mutate(role.id, {
      onSuccess: () => pingToast.success(t('roleDeleted')),
      onError: (error) => pingToast.error(errorMessage(error)),
    });
  }

  return (
    <PingForm
      name={`role-${role.id}`}
      form={form}
      layout="vertical"
      initialValues={{ name: role.name }}
      onFinish={(values) => save(values)}
    >
      <PingFormItem label={t('roleName')} name="name">
        <PingInput maxLength={100} disabled={role.isDefault} />
      </PingFormItem>

      <PermissionGroupEditor value={mask} onChange={setMask} disabled={updateMutation.isPending} />

      <div className="mt-4 flex items-center gap-2">
        <PingButton
          onClick={() => form.submit()}
          loading={updateMutation.isPending}
          disabled={deleteMutation.isPending}
        >
          {tc('save')}
        </PingButton>
        {role.isDefault ? (
          <span className="text-xs text-muted-foreground">{t('defaultRoleHint')}</span>
        ) : (
          <PingPopconfirm
            title={t('deleteRoleTitle')}
            description={t('deleteRoleDescription')}
            okText={t('delete')}
            cancelText={tc('cancel')}
            onConfirm={remove}
            disabled={updateMutation.isPending}
          >
            <PingButton variant="danger" loading={deleteMutation.isPending}>
              {t('deleteRole')}
            </PingButton>
          </PingPopconfirm>
        )}
      </div>
    </PingForm>
  );
}
