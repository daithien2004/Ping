'use client';
import { updateMessageSchema } from '@ping/shared';
import { useEffect, useEffectEvent, useId, useState, type FormEvent } from 'react';
import { useTranslations } from 'use-intl';
import { Dialog } from '@/components/dialog';
import { FormError } from '@/components/form-parts';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useServerAbility } from '@/features/permissions/context';
import { ApiError } from '@/lib/api-client';
import { useErrorMessage } from '@/lib/error-message';
import { useEditMessage } from '../hooks';
import type { ClientMessage } from '../message-cache';

export function EditMessageDialog({
  message,
  channelId,
  onClose,
}: {
  message: ClientMessage;
  channelId: string;
  onClose: () => void;
}) {
  const [form, setForm] = useState({ draft: message.content, editedAt: message.editedAt });
  const mutation = useEditMessage(channelId);
  const { ready } = useServerAbility();
  const t = useTranslations('messages');
  const common = useTranslations('common');
  const errorMessage = useErrorMessage();
  const id = useId();
  const parsed = updateMessageSchema.safeParse({ content: form.draft });
  const changedElsewhere = message.editedAt !== form.editedAt;
  const savedDespiteError =
    mutation.isError &&
    mutation.error instanceof ApiError &&
    (mutation.error.status === 0 || mutation.error.status >= 500) &&
    changedElsewhere &&
    message.content === form.draft.trim();
  const close = useEffectEvent(onClose);
  useEffect(() => {
    if (savedDespiteError) close();
  }, [savedDespiteError]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !ready ||
      mutation.isPending ||
      !parsed.success ||
      changedElsewhere ||
      parsed.data.content === message.content
    )
      return;
    mutation.mutate(
      { id: message.id, content: parsed.data.content, beforeEditedAt: form.editedAt },
      { onSuccess: onClose },
    );
  }

  return (
    <Dialog open onClose={onClose} title={t('editTitle')}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Label htmlFor={id}>{t('editContent')}</Label>
        <Textarea
          id={id}
          value={form.draft}
          onChange={(event) => setForm({ ...form, draft: event.target.value })}
          // Ctrl/Cmd+Enter gửi form. Đặt ở ô nhập (nơi phím được gõ), không ở <form>: phần tử không
          // tương tác không nên nhận sự kiện bàn phím (jsx-a11y).
          onKeyDown={(event) => {
            if (
              event.key === 'Enter' &&
              (event.ctrlKey || event.metaKey) &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }
          }}
          maxLength={4000}
          rows={4}
          // Radix Dialog tự focus phần tử tabbable đầu tiên khi mở (chính ô này), không cần autoFocus.
          // field-sizing-content cho textarea cao theo nội dung: tin dài thì đẩy nút Lưu ra ngoài màn hình.
          className="max-h-64 min-h-24 overflow-y-auto"
          disabled={mutation.isPending}
          aria-invalid={!parsed.success}
        />
        {!parsed.success && <FormError>{t('invalidContent')}</FormError>}
        {changedElsewhere && !savedDespiteError && (
          <div role="alert" className="flex flex-col gap-2 text-sm text-muted-foreground">
            <p>{t('changedElsewhere')}</p>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setForm({ draft: message.content, editedAt: message.editedAt });
                mutation.reset();
              }}
            >
              {t('loadLatest')}
            </Button>
          </div>
        )}
        {mutation.isError && !savedDespiteError && (
          <FormError>{errorMessage(mutation.error)}</FormError>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose}>
            {common('cancel')}
          </Button>
          <Button
            type="submit"
            disabled={
              !ready ||
              mutation.isPending ||
              !parsed.success ||
              changedElsewhere ||
              parsed.data.content === message.content
            }
          >
            {mutation.isPending ? common('processing') : common('save')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
