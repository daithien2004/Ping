'use client';

import { createCategorySchema, ErrorCodes } from '@ping/shared';
import { useTranslations } from 'use-intl';
import { PingButton } from '@/components/ui/ping-button';
import { PingForm, PingFormItem, usePingForm, zodFormRules } from '@/components/ui/ping-form';
import { PingInput } from '@/components/ui/ping-input';
import { PingModal } from '@/components/ui/ping-modal';
import { pingToast } from '@/components/ui/ping-toast';
import { useErrorMessage } from '@/lib/error-message';
import { useCreateCategory, useRenameCategory } from '../hooks';

interface CategoryNameDialogProps {
  serverId: string;
  open: boolean;
  categoryId?: string;
  initialName?: string;
  onClose: () => void;
}

/** TG.10: tạo/đổi tên category — cùng khuôn với ChannelNameDialog, chỉ một trường `name`. */
export function CategoryNameDialog({
  serverId,
  open,
  categoryId,
  initialName = '',
  onClose,
}: CategoryNameDialogProps) {
  const createMutation = useCreateCategory(serverId);
  const renameMutation = useRenameCategory(serverId);
  const [form] = usePingForm<{ name: string }>();
  const rules = zodFormRules(createCategorySchema, () => form.getFieldsValue());
  const errorMessage = useErrorMessage();
  const t = useTranslations('admin');
  const tCommon = useTranslations('common');

  const isRename = Boolean(categoryId);
  const mutation = isRename ? renameMutation : createMutation;

  function save(values: { name: string }) {
    if (isRename && categoryId) {
      renameMutation.mutate(
        { categoryId, name: values.name },
        {
          onSuccess: () => {
            pingToast.success(t('categoryRenamed'));
            form.resetFields();
            onClose();
          },
        },
      );
      return;
    }
    createMutation.mutate(
      { name: values.name },
      {
        onSuccess: () => {
          pingToast.success(t('categoryCreated'));
          form.resetFields();
          onClose();
        },
      },
    );
  }

  return (
    <PingModal
      title={isRename ? t('categoryRename') : t('categoryCreate')}
      open={open}
      onCancel={onClose}
      footer={null}
      destroyOnHidden
      afterOpenChange={(visible) => {
        if (!visible) {
          form.resetFields();
          mutation.reset();
        }
      }}
    >
      <PingForm
        name={isRename ? `category-rename-${categoryId}` : 'category-create'}
        form={form}
        layout="vertical"
        initialValues={isRename ? { name: initialName } : undefined}
        onFinish={save}
        onValuesChange={() => mutation.reset()}
      >
        <PingFormItem label={t('categoryName')} name="name" rules={rules.name}>
          <PingInput maxLength={50} autoComplete="off" />
        </PingFormItem>
        {mutation.isError && (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage(mutation.error, {
              [ErrorCodes.FORBIDDEN]: t('noAccess'),
            })}
          </p>
        )}
        <PingButton
          htmlType="submit"
          loading={mutation.isPending}
          disabled={mutation.isPending}
          className="w-full"
        >
          {mutation.isPending
            ? tCommon('processing')
            : isRename
              ? tCommon('save')
              : tCommon('create')}
        </PingButton>
      </PingForm>
    </PingModal>
  );
}
