'use client';

import { ErrorCodes, joinServerSchema } from '@ping/shared';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { useTranslations } from 'use-intl';
import { z } from 'zod';
import { Dialog } from '@/components/dialog';
import { Field, FormError, SubmitButton } from '@/components/form-parts';
import { useErrorMessage } from '@/lib/error-message';
import { useJoinServer } from '../hooks';
import { serverPath } from '../navigation';

export function JoinServerDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const joinMutation = useJoinServer();
  const [errors, setErrors] = useState<string[] | undefined>();
  const t = useTranslations();
  const errorMessage = useErrorMessage();

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const parsed = joinServerSchema.safeParse({ inviteCode: new FormData(form).get('inviteCode') });
    if (!parsed.success) {
      setErrors(z.flattenError(parsed.error).fieldErrors.inviteCode);
      return;
    }
    setErrors(undefined);
    joinMutation.mutate(parsed.data, {
      onSuccess: ({ server }) => {
        form.reset();
        onClose();
        // Trang server tự chuyển tới channel đầu tiên.
        router.push(serverPath(server.id));
      },
    });
  }

  return (
    <Dialog open={open} onClose={onClose} title={t('servers.join')}>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <Field label={t('servers.inviteCode')} name="inviteCode" errors={errors} />
        {joinMutation.isError && (
          <FormError>
            {errorMessage(joinMutation.error, {
              [ErrorCodes.NOT_FOUND]: t('servers.invalidInvite'),
              [ErrorCodes.CONFLICT]: t('servers.alreadyMember'),
            })}
          </FormError>
        )}
        <SubmitButton pending={joinMutation.isPending}>{t('servers.joinSubmit')}</SubmitButton>
      </form>
    </Dialog>
  );
}
