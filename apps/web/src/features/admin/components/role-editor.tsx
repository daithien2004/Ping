'use client';

import type { RoleDto } from '@ping/shared';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { PingButton } from '@/components/ui/ping-button';
import { PingForm, PingFormItem, usePingForm } from '@/components/ui/ping-form';
import { PingInput } from '@/components/ui/ping-input';
import { PingPopconfirm } from '@/components/ui/ping-popconfirm';
import { PingTable, type PingTableColumn } from '@/components/ui/ping-table';
import { pingToast } from '@/components/ui/ping-toast';
import { useErrorMessage } from '@/lib/error-message';
import { useDeleteRole, useUpdateRole } from '../hooks';
import { maskOf, permissionsOf } from '../permissions';
import { PermissionGroupEditor } from './permission-group-editor';
import { RoleTag } from './role-tag';

interface Props {
  serverId: string;
  roles: RoleDto[];
}

/**
 * Trình sửa vai trò: bảng vai trò (`PingTable` + `PingTag` màu theo vai trò), chọn một
 * vai trò để sửa — đổi tên, bật/tắt quyền theo nhóm (`PingCheckbox`), lưu; xoá vai trò thì
 * phải xác nhận (`PingPopconfirm`) vì không hoàn tác được.
 */
export function RoleEditor({ serverId, roles }: Props) {
  const t = useTranslations('admin');
  const [selectedId, setSelectedId] = useState<string | undefined>(roles[0]?.id);
  const selected = roles.find((role) => role.id === selectedId) ?? roles[0];

  const columns: PingTableColumn<RoleDto>[] = [
    {
      key: 'name',
      header: t('roleName'),
      render: (role) => <RoleTag name={role.name} position={role.position} />,
    },
    { key: 'permissions', header: t('rolePermissions'), render: (role) => role.permissions },
    { key: 'members', header: t('roleMembers'), render: (role) => role.memberCount ?? 0 },
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
      <PingTable
        label={t('roles')}
        columns={columns}
        rows={roles}
        rowKey={(role) => role.id}
        empty={t('rolesEmpty')}
      />
      {selected ? (
        // key = id của vai trò: đổi vai trò thì form và trạng thái quyền khởi tạo lại.
        <RoleForm key={selected.id} serverId={serverId} role={selected} />
      ) : (
        <p className="text-sm text-muted-foreground">{t('rolesEmpty')}</p>
      )}
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
