'use client';

import { createStickerSchema, type StickerDto } from '@ping/shared';
import { useTranslations } from 'use-intl';
import { z } from 'zod';
import { PingButton } from '@/components/ui/ping-button';
import { PingForm, PingFormItem, zodFormRules } from '@/components/ui/ping-form';
import { PingInput } from '@/components/ui/ping-input';
import { PingPopconfirm } from '@/components/ui/ping-popconfirm';
import { pingToast } from '@/components/ui/ping-toast';
import { profileImageUrl } from '@/features/profile/hooks';
import { useCreateSticker, useDeleteSticker, useStickers } from '@/features/stickers/hooks';
import { useErrorMessage } from '@/lib/error-message';
import { useUploadCreateForm } from './use-upload-create-form';

type StickerFormValues = {
  name: string;
  tags?: string;
};

/** Form nhập tags là một chuỗi phân tách dấu phẩy; tách thành mảng để khớp `createStickerSchema`. */
function parseStickerTags(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function suggestStickerName(filename: string): string {
  return filename.replace(/\.[^.]+$/, '').slice(0, 32);
}

/**
 * Quản lý sticker của server (TG.22, ADR-0067): upload PNG/WebP ≤ 512 KB (ảnh động giữ lại,
 * ảnh tĩnh ≤ 512×512), đặt tên + thẻ tìm kiếm rồi claim; xóa có Popconfirm.
 */
export function StickerSection({ serverId }: { serverId: string }) {
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const errorMessage = useErrorMessage();
  const query = useStickers(serverId);
  const { data } = query;
  const createMutation = useCreateSticker(serverId);
  const deleteMutation = useDeleteSticker(serverId);
  const { form, upload, inputRef, chooseFile, resetUpload, submit } = useUploadCreateForm<
    StickerFormValues,
    { attachmentId: string; name: string; tags: string[] }
  >({
    scope: 'sticker',
    serverId,
    suggestName: suggestStickerName,
    buildPayload: (attachmentId, values) => ({
      attachmentId,
      name: values.name.trim(),
      tags: parseStickerTags(values.tags),
    }),
    mutate: createMutation.mutate,
    reset: createMutation.reset,
    successMessage: t('stickerCreated'),
  });
  // Mảng tags validate bằng đúng luật của `createStickerSchema` (8 thẻ, 24 ký tự/thẻ) — không
  // viết lại giới hạn ở client.
  const rules = zodFormRules(
    z.object({
      name: createStickerSchema.shape.name,
      tags: z
        .string()
        .optional()
        .refine(
          (value) => createStickerSchema.shape.tags.safeParse(parseStickerTags(value)).success,
          t('stickerTagsInvalid'),
        ),
    }),
    () => form.getFieldsValue(),
  );

  // Sticker của server = gói có serverId; gói hệ thống (serverId null) chỉ xem được.
  const stickers = (data?.packs ?? []).flatMap((pack) =>
    pack.serverId !== null ? pack.stickers : [],
  );

  function remove(sticker: StickerDto) {
    deleteMutation.mutate(sticker.id, {
      onSuccess: () => pingToast.success(t('stickerDeleted')),
      onError: (error) => pingToast.error(errorMessage(error)),
    });
  }

  return (
    <>
      <h2 className="text-lg font-semibold">{t('stickers')}</h2>
      <p className="text-sm text-muted-foreground">
        {t('stickerHint', { count: stickers.length })}
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/webp"
        className="sr-only"
        aria-label={t('stickerUpload')}
        data-testid="sticker-upload-input"
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
            data-testid="sticker-upload-button"
          >
            {upload.busy
              ? upload.progress === 100
                ? t('stickerProcessing')
                : t('stickerUploading', { percent: upload.progress })
              : t('stickerUpload')}
          </PingButton>
          {upload.error ? (
            <p role="alert" className="text-sm text-destructive">
              {errorMessage(upload.error)}
            </p>
          ) : null}
        </div>
      ) : (
        <PingForm
          name="sticker-create"
          form={form}
          layout="vertical"
          onFinish={submit}
          onValuesChange={() => createMutation.reset()}
          disabled={createMutation.isPending}
          className="max-w-md"
        >
          <PingFormItem label={t('stickerName')} name="name" rules={rules.name}>
            <PingInput maxLength={32} autoComplete="off" data-testid="sticker-name-input" />
          </PingFormItem>
          <PingFormItem label={t('stickerTags')} name="tags" rules={rules.tags}>
            <PingInput
              maxLength={200}
              autoComplete="off"
              placeholder={t('stickerTagsPlaceholder')}
            />
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
              data-testid="sticker-create-submit"
            >
              {createMutation.isPending ? tc('processing') : t('stickerCreate')}
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
      ) : stickers.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('stickersEmpty')}</p>
      ) : (
        <ul aria-label={t('stickers')} className="flex flex-wrap gap-3">
          {stickers.map((sticker) => (
            <li
              key={sticker.id}
              data-testid="sticker-item"
              className="flex w-40 flex-col items-center gap-1 rounded-lg border bg-muted/40 p-2"
            >
              {/* Ảnh đã kiểm định; trong quản trị dùng khung tĩnh cho nhẹ và ổn định layout. */}
              <img
                src={profileImageUrl(sticker.previewUrl)}
                alt={sticker.name}
                width={sticker.width ?? undefined}
                height={sticker.height ?? undefined}
                loading="lazy"
                className="h-20 w-20 object-contain"
              />
              <p className="w-full truncate text-center text-xs font-medium">{sticker.name}</p>
              {sticker.tags.length > 0 && (
                <p className="w-full truncate text-center text-xs text-muted-foreground">
                  {sticker.tags.join(', ')}
                </p>
              )}
              <PingPopconfirm
                title={t('stickerDeleteTitle', { name: sticker.name })}
                description={t('stickerDeleteDescription')}
                okText={t('delete')}
                cancelText={tc('cancel')}
                onConfirm={() => remove(sticker)}
                disabled={deleteMutation.isPending}
              >
                <PingButton
                  variant="danger"
                  size="sm"
                  aria-label={t('stickerDelete', { name: sticker.name })}
                  disabled={deleteMutation.isPending}
                  data-testid="sticker-delete-button"
                >
                  {t('delete')}
                </PingButton>
              </PingPopconfirm>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
