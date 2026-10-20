'use client';

import { createChannelSchema, ErrorCodes } from '@ping/shared';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { useTranslations } from 'use-intl';
import { z } from 'zod';
import { Dialog } from '@/components/dialog';
import { Field, FormError, SubmitButton } from '@/components/form-parts';
import { channelPath } from '@/features/servers/navigation';
import { useErrorMessage } from '@/lib/error-message';
import { useCreateChannel } from '../hooks';

interface Props {
  serverId: string;
  open: boolean;
  onClose: () => void;
}

export function CreateChannelDialog({ serverId, open, onClose }: Props) {
  const router = useRouter();
  const createMutation = useCreateChannel(serverId);
  const [errors, setErrors] = useState<string[] | undefined>();
  const t = useTranslations();
  const errorMessage = useErrorMessage();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const parsed = createChannelSchema.safeParse({ name: new FormData(form).get('name') });
    if (!parsed.success) {
      setErrors(z.flattenError(parsed.error).fieldErrors.name);
      return;
    }
    setErrors(undefined);
    createMutation.mutate(parsed.data, {
      onSuccess: (channel) => {
        form.reset();
        onClose();
        router.push(channelPath(serverId, channel.id));
      },
    });
  }

  return (
    <Dialog open={open} onClose={onClose} title={t('channels.create')}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Field label={t('channels.name')} name="name" errors={errors} />
        {createMutation.isError && (
          <FormError>
            {/* F6 sẽ ẩn nút với người không có MANAGE_CHANNELS; tới lúc đó 403 hiện ở đây. */}
            {errorMessage(createMutation.error, {
              [ErrorCodes.FORBIDDEN]: t('channels.noPermissionCreate'),
            })}
          </FormError>
        )}
        <SubmitButton pending={createMutation.isPending}>{t('common.create')}</SubmitButton>
      </form>
    </Dialog>
  );
}
