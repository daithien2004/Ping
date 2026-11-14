'use client';

import type { ServerDetail } from '@ping/shared';
import { useState } from 'react';
import { useLocale, useTranslations } from 'use-intl';
import { PingButton } from '@/components/ui/ping-button';
import { PingPopconfirm } from '@/components/ui/ping-popconfirm';
import { PingSelect } from '@/components/ui/ping-select';
import { pingToast } from '@/components/ui/ping-toast';
import { useErrorMessage } from '@/lib/error-message';
import { useRegenerateInvite } from '../../hooks';

export function InviteSection({ server }: { server: ServerDetail }) {
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const locale = useLocale();
  const errorMessage = useErrorMessage();
  const mutation = useRegenerateInvite(server.id);
  const [expiresInDays, setExpiresInDays] = useState('');

  async function copyCode() {
    await navigator.clipboard.writeText(server.inviteCode);
    pingToast.success(t('inviteCopied'));
  }

  function regenerate() {
    mutation.mutate(
      { expiresInDays: expiresInDays ? Number(expiresInDays) : undefined },
      {
        onSuccess: ({ invite }) => pingToast.success(t('inviteRegenerated', { code: invite.code })),
        onError: (error) => pingToast.error(errorMessage(error)),
      },
    );
  }

  return (
    <section aria-label={t('invite')} className="flex flex-col gap-3" data-testid="invite-section">
      <h2 className="text-lg font-semibold">{t('invite')}</h2>
      <p className="text-sm text-muted-foreground">{t('inviteHint')}</p>
      <div className="flex flex-wrap items-center gap-2">
        <code data-testid="invite-code" className="select-all rounded bg-muted px-2 py-1 text-sm">
          {server.inviteCode}
        </code>
        <span className="text-sm text-muted-foreground">
          {server.inviteExpiresAt
            ? t('inviteExpiresAt', {
                time: new Date(server.inviteExpiresAt).toLocaleString(locale),
              })
            : t('inviteNeverExpires')}
        </span>
        <PingButton
          variant="secondary"
          size="sm"
          aria-label={t('inviteCopy')}
          onClick={() => void copyCode()}
        >
          {t('inviteCopy')}
        </PingButton>
      </div>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          {t('inviteExpiry')}
          <PingSelect
            aria-label={t('inviteExpiry')}
            className="w-44"
            value={expiresInDays}
            onChange={setExpiresInDays}
            options={[
              { value: '', label: t('inviteExpiryNever') },
              { value: '1', label: t('inviteExpiryDays', { days: 1 }) },
              { value: '7', label: t('inviteExpiryDays', { days: 7 }) },
              { value: '30', label: t('inviteExpiryDays', { days: 30 }) },
            ]}
          />
        </label>
        <PingPopconfirm
          title={t('inviteRegenerateTitle')}
          description={t('inviteRegenerateDescription')}
          okText={t('inviteRegenerate')}
          cancelText={tc('cancel')}
          onConfirm={regenerate}
          disabled={mutation.isPending}
        >
          <PingButton variant="secondary" loading={mutation.isPending}>
            {t('inviteRegenerate')}
          </PingButton>
        </PingPopconfirm>
      </div>
    </section>
  );
}
