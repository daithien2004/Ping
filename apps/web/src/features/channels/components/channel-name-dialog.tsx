'use client';

import { createChannelSchema, ErrorCodes } from '@ping/shared';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'use-intl';
import { PingButton } from '@/components/ui/ping-button';
import { PingForm, PingFormItem, usePingForm, zodFormRules } from '@/components/ui/ping-form';
import { PingInput } from '@/components/ui/ping-input';
import { PingModal } from '@/components/ui/ping-modal';
import { pingToast } from '@/components/ui/ping-toast';
import { useServerAbility } from '@/features/permissions/context';
import { channelPath } from '@/features/servers/navigation';
import { useErrorMessage } from '@/lib/error-message';
import { useCreateChannel, useUpdateChannel } from '../hooks';

interface ChannelNameDialogProps {
  serverId: string;
  open: boolean;
  channelId?: string;
  initialName?: string;
  navigateOnCreate?: boolean;
  onClose: () => void;
  onCreated?: (channelId: string) => void;
}

export function ChannelNameDialog({
  serverId,
  open,
  channelId,
  initialName = '',
  navigateOnCreate = true,
  onClose,
  onCreated,
}: ChannelNameDialogProps) {
  const { ready, ability } = useServerAbility();
  const router = useRouter();
  const createMutation = useCreateChannel(serverId);
  const updateMutation = useUpdateChannel(serverId);
  const [form] = usePingForm<{ name: string }>();
  const rules = zodFormRules(createChannelSchema, () => form.getFieldsValue());
  const errorMessage = useErrorMessage();
  const tChannels = useTranslations('channels');
  const tCommon = useTranslations('common');

  const isRename = Boolean(channelId);
  const canManage = ability.can('manage', 'Channel');

  function save(values: { name: string }) {
    if (!ready || !canManage) return;
    if (isRename && channelId) {
      updateMutation.mutate(
        { channelId, input: { name: values.name } },
        {
          onSuccess: () => {
            pingToast.success(tChannels('renamed'));
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
        onSuccess: (channel) => {
          form.resetFields();
          if (navigateOnCreate) {
            onClose();
            router.push(channelPath(serverId, channel.id));
            return;
          }
          onCreated?.(channel.id);
          pingToast.success(tChannels('created'));
          onClose();
        },
      },
    );
  }

  const mutation = isRename ? updateMutation : createMutation;
  const title = isRename ? tChannels('rename') : tChannels('create');

  return (
    <PingModal
      title={title}
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
        name={isRename ? `channel-rename-${channelId}` : 'channel-create'}
        form={form}
        layout="vertical"
        initialValues={isRename ? { name: initialName } : undefined}
        onFinish={save}
        onValuesChange={() => mutation.reset()}
        disabled={!ready || !canManage}
      >
        <PingFormItem label={tChannels('name')} name="name" rules={rules.name}>
          <PingInput maxLength={100} autoComplete="off" />
        </PingFormItem>
        {(mutation.isError || !canManage) && (
          <p role="alert" className="text-sm text-destructive">
            {mutation.isError
              ? errorMessage(mutation.error, {
                  [ErrorCodes.FORBIDDEN]: tChannels(
                    isRename ? 'noPermissionManage' : 'noPermissionCreate',
                  ),
                })
              : tChannels(isRename ? 'noPermissionManage' : 'noPermissionCreate')}
          </p>
        )}
        <PingButton
          htmlType="submit"
          loading={mutation.isPending}
          disabled={!ready || !canManage || mutation.isPending}
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
