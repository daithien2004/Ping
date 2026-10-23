'use client';

import { updateServerSchema, type ServerDetail } from '@ping/shared';
import { useTranslations } from 'use-intl';
import { PingButton } from '@/components/ui/ping-button';
import { PingForm, PingFormItem, usePingForm, zodFormRules } from '@/components/ui/ping-form';
import { PingInput } from '@/components/ui/ping-input';
import { pingToast } from '@/components/ui/ping-toast';
import { useUpdateServer } from '@/features/servers/hooks';
import { useErrorMessage } from '@/lib/error-message';

/**
 * Đổi tên server (T3.1). Cùng schema zod với API và lúc tạo server, nên luật 1–100 ký tự
 * chỉ tồn tại ở một nơi. Cache chi tiết + danh sách server được cập nhật ngay khi lưu xong.
 */
export function ServerNameForm({ server }: { server: ServerDetail }) {
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const errorMessage = useErrorMessage();
  const [form] = usePingForm<{ name: string }>();
  const rules = zodFormRules(updateServerSchema, () => form.getFieldsValue());
  const mutation = useUpdateServer(server.id);

  function save(values: { name: string }) {
    mutation.mutate(values, {
      onSuccess: (updated) => {
        // Đưa form về đúng giá trị đã lưu để nút "Lưu" tắt lại và lần sửa sau bắt đầu từ đây.
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
        <PingButton htmlType="submit" loading={mutation.isPending} disabled={mutation.isPending}>
          {tc('save')}
        </PingButton>
      </PingForm>
    </section>
  );
}
