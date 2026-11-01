'use client';

import dynamic from 'next/dynamic';
import { BotIcon } from 'lucide-react';
import { Suspense } from 'react';
import { useTranslations } from 'use-intl';
import { Button } from '@/components/ui/button';

// Tải lười: chunk ngăn kéo + xử lý SSE chỉ nạp ở lần bấm "Hỏi Ping" đầu tiên (T6.10).
const LazyAskDrawer = dynamic(() => import('./ask-drawer').then((module) => module.AskDrawer), {
  ssr: false,
});

export interface AskDialogProps {
  serverId: string;
  channelId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Bấm vào một trích dẫn để nhảy tới tin gốc (id tin, channelId của tin nếu biết). */
  onCitationClick?: (messageId: string, channelId?: string) => void;
}

/**
 * Nút "Hỏi Ping" + ngăn kéo hỏi AI (T5.6, TF.11). Trigger giữ trong bundle ban đầu; phần
 * ngăn kéo nặng (SSE, skeleton, citations) là chunk riêng, tải ở lần mở đầu tiên (T6.10).
 */
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
      <Button
        type="button"
        size="sm"
        variant="outline"
        aria-label={t('ask.title')}
        onClick={() => onOpenChange(true)}
        data-testid="ask-ai-button"
      >
        <BotIcon className="mr-1.5 size-4" />
        {t('ask.askButton')}
      </Button>
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
