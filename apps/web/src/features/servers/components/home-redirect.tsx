'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTranslations } from 'use-intl';
import { PingButton } from '@/components/ui/ping-button';
import { useServers } from '../hooks';
import { homePath } from '../navigation';
import { OnboardingWizard, type OnboardingMode } from './onboarding-wizard';

/** "/servers": vào server đầu tiên; chưa có server thì mở wizard tạo/tham gia. */
export function HomeRedirect() {
  const router = useRouter();
  const { data: servers } = useServers();
  const target = homePath(servers);
  const [wizard, setWizard] = useState<OnboardingMode | null>(null);
  const t = useTranslations('servers');

  useEffect(() => {
    if (target) router.replace(target);
  }, [target, router]);

  if (target) return null;

  return (
    <div className="m-auto flex flex-col items-center gap-4 text-center">
      <h1 className="text-xl font-semibold">{t('emptyTitle')}</h1>
      <p className="text-sm text-muted-foreground">{t('emptyHint')}</p>
      <div className="flex gap-2">
        <PingButton onClick={() => setWizard('create')}>{t('create')}</PingButton>
        <PingButton variant="secondary" onClick={() => setWizard('join')}>
          {t('enterInvite')}
        </PingButton>
      </div>
      <OnboardingWizard
        open={wizard !== null}
        initialMode={wizard ?? undefined}
        onClose={() => setWizard(null)}
      />
    </div>
  );
}
