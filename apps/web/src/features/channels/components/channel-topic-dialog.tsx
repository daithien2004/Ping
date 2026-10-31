'use client';

import { ErrorCodes, setTopicSchema } from '@ping/shared';
import { useTranslations } from 'use-intl';
import { PingButton } from '@/components/ui/ping-button';
import { PingForm, PingFormItem, usePingForm, zodFormRules } from '@/components/ui/ping-form';
import { PingModal } from '@/components/ui/ping-modal';
import { PingTextArea } from '@/components/ui/ping-textarea';
import { pingToast } from '@/components/ui/ping-toast';
import { useErrorMessage } from '@/lib/error-message';
import { useSetChannelTopic } from '../hooks';

interface ChannelTopicDialogProps {
  serverId: string;
  channelId: string;
  initialTopic: string;
  open: boolean;
  onClose: () => void;
}

/** TG.10: đặt chủ đề kênh (hiển thị dưới tên ở header); chuỗi rỗng = xoá chủ đề. */
export function ChannelTopicDialog({
  serverId,
  channelId,
  initialTopic,
  open,
  onClose,
}: ChannelTopicDialogProps) {
  const mutation = useSetChannelTopic(serverId);
  const [form] = usePingForm<{ topic: string }>();
  const rules = zodFormRules(setTopicSchema, () => form.getFieldsValue());
  const errorMessage = useErrorMessage();
  const t = useTranslations('channels');
  const tc = useTranslations('common');

  function save(values: { topic: string }) {
    mutation.mutate(
      { channelId, topic: values.topic },
      {
        onSuccess: () => {
          pingToast.success(values.topic.trim() === '' ? t('topicCleared') : t('topicSaved'));
          onClose();
        },
      },
    );
  }

  return (
    <PingModal
      title={t('topic')}
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
        name={`channel-topic-${channelId}`}
        form={form}
        layout="vertical"
        initialValues={{ topic: initialTopic }}
        onFinish={save}
        onValuesChange={() => mutation.reset()}
      >
        <PingFormItem label={t('topic')} name="topic" rules={rules.topic} extra={t('topicHint')}>
          <PingTextArea
            placeholder={t('topicPlaceholder')}
            maxLength={200}
            autoSize={{ minRows: 3, maxRows: 6 }}
            data-testid="channel-topic-input"
          />
        </PingFormItem>
        {mutation.isError && (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage(mutation.error, { [ErrorCodes.FORBIDDEN]: t('noPermissionManage') })}
          </p>
        )}
        <PingButton
          htmlType="submit"
          loading={mutation.isPending}
          disabled={mutation.isPending}
          className="w-full"
        >
          {mutation.isPending ? tc('processing') : tc('save')}
        </PingButton>
      </PingForm>
    </PingModal>
  );
}
