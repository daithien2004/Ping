'use client';

import type { RoleDto } from '@ping/shared';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { z } from 'zod';
import { PingButton } from '@/components/ui/ping-button';
import { PingForm, PingFormItem, usePingForm, zodFormRules } from '@/components/ui/ping-form';
import { PingInput } from '@/components/ui/ping-input';
import { PingModal } from '@/components/ui/ping-modal';
import { pingToast } from '@/components/ui/ping-toast';
import { useErrorMessage } from '@/lib/error-message';
import { useCreateRole } from '../hooks';
import { maskOf, nextPosition, permissionsOf } from '../permissions';
import { PermissionGroupEditor } from './permission-group-editor';

const createRoleFormSchema = z.object({
  name: z.string().trim().min(1).max(100),
});

interface Props {
  serverId: string;
  roles: RoleDto[];
  open: boolean;
  onClose: () => void;
}

/**
 * Tạo vai trò mới (T3.3): tên + nhóm quyền dạng checkbox, vị trí nối sau role cuối để
 * danh sách không nhảy lung tung. Quyền mặc định là 0 — người tạo tự bật những gì cần.
 */
export function RoleCreateDialog({ serverId, roles, open, onClose }: Props) {
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const errorMessage = useErrorMessage();
  const [form] = usePingForm<{ name: string }>();
  const [mask, setMask] = useState(0n);
  const mutation = useCreateRole(serverId);
  const rules = zodFormRules(createRoleFormSchema, () => form.getFieldsValue());

  function reset() {
    form.resetFields();
    setMask(0n);
    mutation.reset();
  }

  function save(values: { name: string }) {
    mutation.mutate(
      {
        name: values.name.trim(),
        permissions: maskOf(permissionsOf(mask)).toString(),
        position: nextPosition(roles),
      },
      {
        onSuccess: () => {
          pingToast.success(t('roleCreated'));
          reset();
          onClose();
        },
        onError: (error) => pingToast.error(errorMessage(error)),
      },
    );
  }

  return (
    <PingModal
      title={t('roleCreateTitle')}
      open={open}
      onCancel={() => {
        reset();
        onClose();
      }}
      footer={null}
      destroyOnHidden
    >
      <PingForm
        name="role-create"
        form={form}
        layout="vertical"
        onFinish={save}
        onValuesChange={() => mutation.reset()}
        disabled={mutation.isPending}
      >
        <PingFormItem label={t('roleName')} name="name" rules={rules.name}>
          <PingInput maxLength={100} autoComplete="off" />
        </PingFormItem>

        <PermissionGroupEditor value={mask} onChange={setMask} disabled={mutation.isPending} />

        <PingButton
          htmlType="submit"
          loading={mutation.isPending}
          disabled={mutation.isPending}
          className="mt-4 w-full"
        >
          {mutation.isPending ? tc('processing') : tc('create')}
        </PingButton>
      </PingForm>
    </PingModal>
  );
}
