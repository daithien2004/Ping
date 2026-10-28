'use client';

import { CUSTOM_EMOJI_NAME, type CustomEmojiDto, type StickerDto } from '@ping/shared';
import { useRef } from 'react';
import { useTranslations } from 'use-intl';
import { z } from 'zod';
import { PingButton } from '@/components/ui/ping-button';
import { PingForm, PingFormItem, usePingForm, zodFormRules } from '@/components/ui/ping-form';
import { PingInput } from '@/components/ui/ping-input';
import { PingPopconfirm } from '@/components/ui/ping-popconfirm';
import { pingToast } from '@/components/ui/ping-toast';
import { useProfileUpload } from '@/features/profile/hooks';
import { useCreateSticker, useDeleteSticker, useStickers } from '@/features/stickers/hooks';
import { suggestEmojiName } from '@/features/emojis/emoji-utils';
import { useCreateEmoji, useDeleteEmoji, useEmojis } from '@/features/emojis/hooks';
import { useErrorMessage } from '@/lib/error-message';
import { profileImageUrl } from '@/features/profile/hooks';

const createStickerFormSchema = z.object({
  name: z.string().trim().min(1).max(32),
  // Chuỗi thẻ phân tách dấu phẩy; tách ở submit, API tự validate từng thẻ.
  tags: z.string().max(200).optional(),
});

/**
 * Quản lý biểu cảm của server (TG.22 + TG.24, ADR-0067/0068): khối sticker rồi khối emoji —
 * cùng section vì cùng nhóm quyền `manage Sticker` (MANAGE_EXPRESSIONS). Cả hai tải lên qua
 * pipeline TG.6 với scope riêng (worker kiểm định), xóa có Popconfirm. Ẩn/hiện theo ability
 * — API vẫn kiểm tra lại.
 */
export function StickerManager({ serverId }: { serverId: string }) {
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const errorMessage = useErrorMessage();
  const { data } = useStickers(serverId);
  const createMutation = useCreateSticker(serverId);
  const deleteMutation = useDeleteSticker(serverId);
  const upload = useProfileUpload('sticker', serverId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [form] = usePingForm<{ name: string; tags?: string }>();
  const rules = zodFormRules(createStickerFormSchema, () => form.getFieldsValue());

  // Sticker của server = gói có serverId; gói hệ thống (serverId null) chỉ xem được.
  const stickers = (data?.packs ?? []).flatMap((pack) =>
    pack.serverId !== null ? pack.stickers : [],
  );

  function chooseFile(file: File | undefined) {
    if (!file) return;
    // Tên gợi ý từ tên tệp (bỏ đuôi, ≤32 ký tự) — người dùng sửa lại trong form.
    form.setFieldsValue({ name: file.name.replace(/\.[^.]+$/, '').slice(0, 32) });
    upload.choose(file);
  }

  function resetUpload() {
    upload.reset();
    form.resetFields();
    createMutation.reset();
  }

  function create(values: { name: string; tags?: string }) {
    if (!upload.attachmentId) return;
    const tags = (values.tags ?? '')
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
    createMutation.mutate(
      { attachmentId: upload.attachmentId, name: values.name.trim(), tags },
      {
        onSuccess: () => {
          pingToast.success(t('stickerCreated'));
          resetUpload();
        },
        onError: (error) => pingToast.error(errorMessage(error)),
      },
    );
  }

  function remove(sticker: StickerDto) {
    deleteMutation.mutate(sticker.id, {
      onSuccess: () => pingToast.success(t('stickerDeleted')),
      onError: (error) => pingToast.error(errorMessage(error)),
    });
  }

  return (
    <section
      aria-label={t('stickers')}
      className="flex flex-col gap-3"
      data-testid="sticker-section"
    >
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
          onFinish={create}
          onValuesChange={() => createMutation.reset()}
          disabled={createMutation.isPending}
          className="max-w-md"
        >
          <PingFormItem label={t('stickerName')} name="name" rules={rules.name}>
            <PingInput maxLength={32} autoComplete="off" data-testid="sticker-name-input" />
          </PingFormItem>
          <PingFormItem label={t('stickerTags')} name="tags" rules={rules.tags}>
            <PingInput maxLength={200} autoComplete="off" placeholder="hello, vui" />
          </PingFormItem>
          {createMutation.isError && (
            <p role="alert" className="mb-2 text-sm text-destructive">
              {errorMessage(createMutation.error)}
            </p>
          )}
          <div className="flex gap-2">
            <PingButton
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
      {stickers.length === 0 ? (
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
      <EmojiManager serverId={serverId} />
    </section>
  );
}

/**
 * Quản lý emoji tùy chỉnh của server (TG.24, ADR-0068): upload scope `customEmoji`
 * (PNG/WebP ≤ 256 KB — worker xuất WebP ≤ 128×128, trần 50 tĩnh + 50 động), đặt tên
 * `[a-z0-9_]` rồi claim; xóa mềm — tin cũ hiển thị placeholder `:ten:`.
 */
function EmojiManager({ serverId }: { serverId: string }) {
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const errorMessage = useErrorMessage();
  const { data } = useEmojis(serverId);
  const createMutation = useCreateEmoji(serverId);
  const deleteMutation = useDeleteEmoji(serverId);
  const upload = useProfileUpload('customEmoji', serverId);
  const inputRef = useRef<HTMLInputElement>(null);
  const [form] = usePingForm<{ name: string }>();
  // Schema trong component để nhắn lỗi qua i18n (`emojiInvalidName`) — cùng luật shared.
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

  function chooseFile(file: File | undefined) {
    if (!file) return;
    // Tên gợi ý từ tên tệp (thường hóa, không dấu, [a-z0-9_]) — người dùng sửa lại trong form.
    form.setFieldsValue({ name: suggestEmojiName(file.name) });
    upload.choose(file);
  }

  function resetUpload() {
    upload.reset();
    form.resetFields();
    createMutation.reset();
  }

  function create(values: { name: string }) {
    if (!upload.attachmentId) return;
    createMutation.mutate(
      { attachmentId: upload.attachmentId, name: values.name.trim() },
      {
        onSuccess: () => {
          pingToast.success(t('emojiCreated'));
          resetUpload();
        },
        onError: (error) => pingToast.error(errorMessage(error)),
      },
    );
  }

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
          onFinish={create}
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
      {emojis.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t('emojisEmpty')}</p>
      ) : (
        <ul aria-label={t('emojis')} className="flex flex-wrap gap-3">
          {emojis.map((emoji) => (
            <li
              key={emoji.id}
              data-testid="emoji-item"
              className="flex w-24 flex-col items-center gap-1 rounded-lg border bg-muted/40 p-2"
            >
              {/* TG.24: dùng url gốc — emoji động giữ chuyển động ngay trong quản trị. */}
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
