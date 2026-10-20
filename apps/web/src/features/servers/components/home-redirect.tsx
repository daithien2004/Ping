'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useTranslations } from 'use-intl';
import { Button } from '@/components/ui/button';
import { useServers } from '../hooks';
import { homePath } from '../navigation';
import { CreateServerDialog } from './create-server-dialog';
import { JoinServerDialog } from './join-server-dialog';

/** "/": có server thì vào server đầu tiên, chưa có thì mời tạo hoặc tham gia. */
export function HomeRedirect() {
  const router = useRouter();
  const { data: servers } = useServers();
  const target = homePath(servers);
  const [dialog, setDialog] = useState<'create' | 'join' | null>(null);
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
        <Button onClick={() => setDialog('create')}>{t('create')}</Button>
        <Button variant="outline" onClick={() => setDialog('join')}>
          {t('enterInvite')}
        </Button>
      </div>
      <CreateServerDialog open={dialog === 'create'} onClose={() => setDialog(null)} />
      <JoinServerDialog open={dialog === 'join'} onClose={() => setDialog(null)} />
    </div>
  );
}
