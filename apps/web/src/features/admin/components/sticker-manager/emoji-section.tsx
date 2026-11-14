'use client';

import { CUSTOM_EMOJI_NAME, type CustomEmojiDto } from '@ping/shared';
import { useTranslations } from 'use-intl';
import { z } from 'zod';
import { PingButton } from '@/components/ui/ping-button';
import { PingForm, PingFormItem, zodFormRules } from '@/components/ui/ping-form';
import { PingInput } from '@/components/ui/ping-input';
import { PingPopconfirm } from '@/components/ui/ping-popconfirm';
import { pingToast } from '@/components/ui/ping-toast';
import { suggestEmojiName } from '@/features/emojis/emoji-utils';
import { useCreateEmoji, useDeleteEmoji, useEmojis } from '@/features/emojis/hooks';
import { profileImageUrl } from '@/features/profile/hooks';
import { useErrorMessage } from '@/lib/error-message';
import { useUploadCreateForm } from './use-upload-create-form';

type EmojiFormValues = {
  name: string;
};

export function EmojiSection({ serverId }: { serverId: string }) {
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const errorMessage = useErrorMessage();
  const query = useEmojis(serverId);
  const { data } = query;
  const createMutation = useCreateEmoji(serverId);
  const deleteMutation = useDeleteEmoji(serverId);
  const { form, upload, inputRef, chooseFile, resetUpload, submit } = useUploadCreateForm<
    EmojiFormValues,
    { attachmentId: string; name: string }
  >({
    scope: 'customEmoji',
    serverId,
    suggestName: suggestEmojiName,
    buildPayload: (attachmentId, values) => ({ attachmentId, name: values.name.trim() }),
    mutate: createMutation.mutate,
    reset: createMutation.reset,
    successMessage: t('emojiCreated'),
  });
  const rules = zodFormRules(
    z.object({
      name: z
        .string()
        .trim()
        .min(2, t('emojiInvalidName'))
        .max(32, t('emojiInvalidName'))
        .refine((value) => CUSTOM_EMOJI_NAME.test(value), t('emojiInvalidName')),
    }),
    () => form.getFieldsValue(),
  );
  const emojis = data?.emojis ?? [];

  function remove(emoji: CustomEmojiDto) {
    deleteMutation.mutate(emoji.id, {
      onSuccess: () => pingToast.success(t('emojiDeleted')),
      onError: (error) => pingToast.error(errorMessage(error)),
    });
  }

  return (
    <div className="flex flex-col gap-3" aria-label={t('emojis')} data-testid="emoji-section">
      <h3 className="text-base font-semibold">{t('emojis')}</h3>
      <p className="text-sm text-muted-foreground">{t('emojiHint')}</p>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/webp"
        className="sr-only"
        aria-label={t('emojiUpload')}
        data-testid="emoji-upload-input"
        disabled={upload.busy}
        onChange={(event) => {
          chooseFile(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
      {!upload.attachmentId ? (
        <div className="flex flex-wrap items-center gap-2">
          <PingButton
            variant="secondary"
            onClick={() => inputRef.current?.click()}
            loading={upload.busy}
            disabled={upload.busy}
            data-testid="emoji-upload-button"
          >
            {upload.busy
              ? upload.progress === 100
                ? t('emojiProcessing')
                : t('emojiUploading', { percent: upload.progress })
              : t('emojiUpload')}
          </PingButton>
          {upload.error ? (
            <p role="alert" className="text-sm text-destructive">
              {errorMessage(upload.error)}
            </p>
          ) : null}
        </div>
      ) : (
        <PingForm
          name="emoji-create"
          form={form}
          layout="vertical"
          onFinish={submit}
          onValuesChange={() => createMutation.reset()}
          disabled={createMutation.isPending}
          className="max-w-md"
        >
          <PingFormItem label={t('emojiName')} name="name" rules={rules.name}>
            <PingInput maxLength={32} autoComplete="off" data-testid="emoji-name-input" />
          </PingFormItem>
          {createMutation.isError && (
            <p role="alert" className="mb-2 text-sm text-destructive">
              {errorMessage(createMutation.error)}
            </p>
          )}
          <div className="flex gap-2">
            <PingButton
              variant="primary"
              htmlType="submit"
              loading={createMutation.isPending}
              disabled={createMutation.isPending}
              data-testid="emoji-create-submit"
            >
              {createMutation.isPending ? tc('processing') : t('emojiCreate')}
            </PingButton>
            <PingButton
              variant="secondary"
              onClick={resetUpload}
              disabled={createMutation.isPending}
            >
              {tc('cancel')}
            </PingButton>
          </div>
        </PingForm>
      )}
      {query.isPending ? (
        <p role="status" className="text-sm text-muted-foreground">
          {tc('loading')}
        </p>
      ) : query.isError ? (
        <div role="alert" className="flex flex-col items-start gap-2 text-sm text-destructive">
          <p>{errorMessage(query.error)}</p>
          <PingButton
            variant="secondary"
            size="sm"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            {tc('retry')}
          </PingButton>
        </div>
      ) : emojis.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('emojisEmpty')}</p>
      ) : (
        <ul aria-label={t('emojis')} className="flex flex-wrap gap-3">
          {emojis.map((emoji) => (
            <li
              key={emoji.id}
              data-testid="emoji-item"
              className="flex w-24 flex-col items-center gap-1 rounded-lg border bg-muted/40 p-2"
            >
              <img
                src={profileImageUrl(emoji.url)}
                alt={emoji.name}
                width={emoji.width ?? undefined}
                height={emoji.height ?? undefined}
                loading="lazy"
                className="h-12 w-12 object-contain"
              />
              <p className="w-full truncate text-center text-xs font-medium">{emoji.name}</p>
              <PingPopconfirm
                title={t('emojiDeleteTitle', { name: emoji.name })}
                description={t('emojiDeleteDescription')}
                okText={t('delete')}
                cancelText={tc('cancel')}
                onConfirm={() => remove(emoji)}
                disabled={deleteMutation.isPending}
              >
                <PingButton
                  variant="danger"
                  size="sm"
                  aria-label={t('emojiDelete', { name: emoji.name })}
                  disabled={deleteMutation.isPending}
                  data-testid="emoji-delete-button"
                >
                  {t('delete')}
                </PingButton>
              </PingPopconfirm>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
