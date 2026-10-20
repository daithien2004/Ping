'use client';
import { useTranslations } from 'use-intl';
import { Dialog } from '@/components/dialog';
import { FormError } from '@/components/form-parts';
import { Button } from '@/components/ui/button';
import { useServerAbility } from '@/features/permissions/context';
import { useErrorMessage } from '@/lib/error-message';
import { useDeleteMessage } from '../hooks';
import type { ClientMessage } from '../message-cache';

export function DeleteMessageDialog({
  message,
  channelId,
  onClose,
}: {
  message: ClientMessage;
  channelId: string;
  onClose: () => void;
}) {
  const mutation = useDeleteMessage(channelId);
  const { ready } = useServerAbility();
  const t = useTranslations('messages');
  const common = useTranslations('common');
  const errorMessage = useErrorMessage();
  return (
    <Dialog open onClose={onClose} title={t('deleteTitle')}>
      <p className="text-sm text-muted-foreground">{t('deleteConfirm')}</p>
      <p className="max-h-48 overflow-y-auto rounded-md bg-muted p-3 text-sm break-words whitespace-pre-wrap">
        {message.content}
      </p>
      {mutation.isError && <FormError>{errorMessage(mutation.error)}</FormError>}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose}>
          {common('cancel')}
        </Button>
        <Button
          variant="destructive"
          disabled={!ready || mutation.isPending}
          onClick={() => {
            if (ready && !mutation.isPending) mutation.mutate(message.id, { onSuccess: onClose });
          }}
        >
          {mutation.isPending ? common('processing') : t('delete')}
        </Button>
      </div>
    </Dialog>
  );
}
