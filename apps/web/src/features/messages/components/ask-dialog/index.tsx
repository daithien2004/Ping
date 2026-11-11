'use client';

import dynamic from 'next/dynamic';
import { Sparkles } from 'lucide-react';
import { Suspense } from 'react';
import { useTranslations } from 'use-intl';
import { PingIconButton } from '@/components/ui/ping-icon-button';

const LazyAskDrawer = dynamic(() => import('./ask-drawer').then((module) => module.AskDrawer), {
  ssr: false,
});

export interface AskDialogProps {
  serverId: string;
  channelId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCitationClick?: (messageId: string, channelId?: string) => void;
}

export function AskDialog({
  serverId,
  channelId,
  open,
  onOpenChange,
  onCitationClick,
}: AskDialogProps) {
  const t = useTranslations();
  return (
    <>
      <PingIconButton
        icon={<Sparkles />}
        aria-label={t('ask.title')}
        onClick={() => onOpenChange(true)}
        data-testid="ask-ai-button"
      />
      {open && (
        <Suspense fallback={null}>
          <LazyAskDrawer
            serverId={serverId}
            channelId={channelId}
            open
            onOpenChange={onOpenChange}
            onCitationClick={onCitationClick}
          />
        </Suspense>
      )}
    </>
  );
}
