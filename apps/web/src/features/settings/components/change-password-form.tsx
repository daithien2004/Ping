'use client';

import { changePasswordSchema, type ChangePasswordInput } from '@ping/shared';
import { useTranslations } from 'use-intl';
import { PingButton } from '@/components/ui/ping-button';
import {
  PingForm,
  PingFormItem,
  usePingForm,
  useResetOnHide,
  zodFormRules,
} from '@/components/ui/ping-form';
import { PingPasswordInput } from '@/components/ui/ping-password-input';
import { pingToast } from '@/components/ui/ping-toast';
import { useErrorMessage } from '@/lib/error-message';
import { useChangePassword } from '@/features/auth/hooks';

const CHANGE_PASSWORD_FIELDS = ['currentPassword', 'password', 'confirmPassword'] as const;

type ChangePasswordValues = {
  currentPassword: string;
  password: string;
  confirmPassword: string;
};

export function ChangePasswordForm() {
  const t = useTranslations('settings.account');
  const errorMessage = useErrorMessage();
  const [form] = usePingForm<ChangePasswordValues>();
  // <Activity> giữ trang ẩn khi rời /settings: mật khẩu gõ dở phải bị xoá (CLAUDE.md Frontend).
  const containerRef = useResetOnHide(form, CHANGE_PASSWORD_FIELDS);
  const change = useChangePassword();
  const rules = zodFormRules(
    changePasswordSchema.pick({ currentPassword: true, password: true }),
    () => form.getFieldsValue(),
  );

  return (
    <div ref={containerRef}>
      <PingForm
        form={form}
        // Tên form làm tiền tố id: trang /settings ẩn vẫn nằm trong DOM (<Activity>), thiếu name thì ô `password` trùng id với form đặt lại mật khẩu.
        name="settingsChangePassword"
        layout="vertical"
        noValidate
        className="flex max-w-sm flex-col"
        data-testid="settings-change-password"
        onFinish={(values) => {
          const parsed = changePasswordSchema
            .pick({ currentPassword: true, password: true })
            .safeParse(values);
          if (!parsed.success) return;
          if (values.confirmPassword !== parsed.data.password) {
            form.setFields([{ name: 'confirmPassword', errors: [t('passwordMismatch')] }]);
            return;
          }
          const input: ChangePasswordInput = parsed.data;
          change.mutate(input, {
            onSuccess: () => {
              pingToast.success(t('changePasswordSuccess'));
              form.resetFields();
            },
          });
        }}
      >
        <p className="mb-2 text-sm text-muted-foreground">{t('changePasswordNote')}</p>
        <PingFormItem
          label={t('currentPassword')}
          name="currentPassword"
          rules={rules.currentPassword}
        >
          <PingPasswordInput autoComplete="current-password" />
        </PingFormItem>
        <PingFormItem label={t('newPassword')} name="password" rules={rules.password}>
          <PingPasswordInput autoComplete="new-password" />
        </PingFormItem>
        <PingFormItem
          label={t('confirmNewPassword')}
          name="confirmPassword"
          dependencies={['password']}
          rules={[
            {
              validator: (_rule, value: string) =>
                value === form.getFieldValue('password')
                  ? Promise.resolve()
                  : Promise.reject(new Error(t('passwordMismatch'))),
            },
          ]}
        >
          <PingPasswordInput autoComplete="new-password" />
        </PingFormItem>
        {change.isError && (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage(change.error)}
          </p>
        )}
        <PingButton
          variant="primary"
          htmlType="submit"
          block
          loading={change.isPending}
          data-testid="settings-change-password-submit"
        >
          {t('changePasswordAction')}
        </PingButton>
      </PingForm>
    </div>
  );
}
