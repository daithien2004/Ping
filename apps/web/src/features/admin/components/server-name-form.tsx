'use client';

import { updateServerSchema, type ServerDetail } from '@ping/shared';
import { useTranslations } from 'use-intl';
import { useEffect, useRef } from 'react';
import { PingButton } from '@/components/ui/ping-button';
import { PingForm, PingFormItem, usePingForm, zodFormRules } from '@/components/ui/ping-form';
import { PingInput } from '@/components/ui/ping-input';
import { pingToast } from '@/components/ui/ping-toast';
import { UserAvatar } from '@/features/profile/components/user-avatar';
import { useProfileUpload } from '@/features/profile/hooks';
import { useUpdateServer } from '@/features/servers/hooks';
import { useErrorMessage } from '@/lib/error-message';

export function ServerNameForm({ server }: { server: ServerDetail }) {
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const errorMessage = useErrorMessage();
  const [form] = usePingForm<{ name: string }>();
  const rules = zodFormRules(updateServerSchema, () => form.getFieldsValue());
  const mutation = useUpdateServer(server.id);
  const icon = useProfileUpload('serverIcon', server.id);
  const iconInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!icon.attachmentId || mutation.isPending) return;
    const attachmentId = icon.attachmentId;
    icon.reset();
    mutation.mutate(
      { iconAttachmentId: attachmentId },
      {
        onSuccess: () => pingToast.success(t('serverIconSaved')),
        onError: (error) => pingToast.error(errorMessage(error)),
      },
    );
    // mutation.mutate ổn định; chỉ chạy khi attachment icon đổi.
  }, [icon.attachmentId, mutation.mutate]);

  function save(values: { name: string }) {
    mutation.mutate(values, {
      onSuccess: (updated) => {
        form.setFieldsValue({ name: updated.name });
        pingToast.success(t('serverNameSaved'));
      },
      onError: (error) => pingToast.error(errorMessage(error)),
    });
  }

  return (
    <section aria-label={t('serverSection')} className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{t('serverSection')}</h2>
      <p className="text-sm text-muted-foreground">{t('serverNameHint')}</p>
      <input
        ref={iconInput}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        aria-label={t('serverIconChange')}
        data-testid="server-icon-input"
        disabled={icon.busy || mutation.isPending}
        onChange={(event) => {
          icon.choose(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      <div className="flex items-center gap-3">
        <UserAvatar
          name={server.name}
          avatarUrl={server.iconUrl}
          size={48}
          style={{ borderRadius: 'var(--ping-radius-2xl)' }}
        />
        <div className="flex flex-col gap-1">
          <PingButton
            size="sm"
            variant="secondary"
            onClick={() => iconInput.current?.click()}
            loading={icon.busy}
          >
            {t('serverIconChange')}
          </PingButton>
          {icon.busy ? (
            <span role="status" className="text-xs text-muted-foreground">
              {icon.progress === 0
                ? t('serverIconProcessing')
                : t('serverIconUploading', { percent: icon.progress })}
            </span>
          ) : null}
          {icon.error ? (
            <p role="alert" className="text-xs text-destructive" data-testid="server-icon-error">
              {errorMessage(icon.error)}
            </p>
          ) : null}
        </div>
      </div>
      <PingForm
        name="server-name"
        form={form}
        layout="vertical"
        initialValues={{ name: server.name }}
        onFinish={save}
        onValuesChange={() => mutation.reset()}
        className="max-w-md"
      >
        <PingFormItem label={t('serverName')} name="name" rules={rules.name}>
          <PingInput maxLength={100} autoComplete="off" />
        </PingFormItem>
        <PingButton
          variant="primary"
          htmlType="submit"
          loading={mutation.isPending}
          disabled={mutation.isPending}
        >
          {tc('save')}
        </PingButton>
      </PingForm>
    </section>
  );
}
