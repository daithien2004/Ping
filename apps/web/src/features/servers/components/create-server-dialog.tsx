'use client';

import { createServerSchema } from '@ping/shared';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { useTranslations } from 'use-intl';
import { z } from 'zod';
import { Dialog } from '@/components/dialog';
import { Field, FormError, SubmitButton } from '@/components/form-parts';
import { useErrorMessage } from '@/lib/error-message';
import { useCreateServer } from '../hooks';
import { channelPath } from '../navigation';

export function CreateServerDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const createMutation = useCreateServer();
  const [errors, setErrors] = useState<string[] | undefined>();
  const t = useTranslations();
  const errorMessage = useErrorMessage();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const parsed = createServerSchema.safeParse({ name: new FormData(form).get('name') });
    if (!parsed.success) {
      setErrors(z.flattenError(parsed.error).fieldErrors.name);
      return;
    }
    setErrors(undefined);
    createMutation.mutate(parsed.data, {
      onSuccess: (server) => {
        form.reset();
        onClose();
        // Server mới luôn có #general (tạo cùng transaction ở API): vào thẳng channel đó.
        const general = server.channels[0];
        router.push(general ? channelPath(server.id, general.id) : `/servers/${server.id}`);
      },
    });
  }

  return (
    <Dialog open={open} onClose={onClose} title={t('servers.create')}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Field label={t('servers.name')} name="name" errors={errors} />
        {createMutation.isError && <FormError>{errorMessage(createMutation.error)}</FormError>}
        <SubmitButton pending={createMutation.isPending}>{t('common.create')}</SubmitButton>
      </form>
    </Dialog>
  );
}
