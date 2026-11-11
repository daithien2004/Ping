'use client';

import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { ArrowRightIcon, SendIcon } from 'lucide-react';
import { PingAlert } from '@/components/ui/ping-alert';
import { PingButton } from '@/components/ui/ping-button';
import { PingDrawer } from '@/components/ui/ping-drawer';
import { PingIconButton } from '@/components/ui/ping-icon-button';
import { PingInput } from '@/components/ui/ping-input';
import { PingSkeleton } from '@/components/ui/ping-skeleton';
import { PingSpinner } from '@/components/ui/ping-spinner';
import { useAsk } from './use-ask';

export interface AskDrawerProps {
  serverId: string;
  channelId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCitationClick?: (messageId: string, channelId?: string) => void;
}

export function AskDrawer({
  serverId,
  channelId,
  open,
  onOpenChange,
  onCitationClick,
}: AskDrawerProps) {
  const t = useTranslations();
  const [question, setQuestion] = useState('');
  const { status, answer, citations, errorMessage, ask, cancel } = useAsk({ serverId, channelId });
  const isAsking = status === 'asking';

  function handleOpenChange(next: boolean) {
    if (!next) cancel();
    onOpenChange(next);
  }

  return (
    <PingDrawer
      open={open}
      onClose={() => handleOpenChange(false)}
      title={t('ask.title')}
      size={460}
      footer={
        isAsking ? (
          <PingButton variant="secondary" onClick={cancel} data-testid="ask-cancel">
            {t('common.cancel')}
          </PingButton>
        ) : (
          <PingButton
            variant="secondary"
            onClick={() => handleOpenChange(false)}
            data-testid="ask-close"
          >
            {t('common.close')}
          </PingButton>
        )
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">{t('ask.placeholder')}</p>

        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void ask(question);
          }}
        >
          <PingInput
            type="text"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder={t('ask.placeholder')}
            disabled={isAsking}
            data-testid="ask-input"
          />
          <PingIconButton
            icon={<SendIcon />}
            htmlType="submit"
            disabled={!question.trim() || isAsking}
            aria-label={t('ask.askButton')}
            data-testid="ask-send"
          />
        </form>

        {isAsking && (
          <div className="flex flex-col gap-2">
            <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
              <PingSpinner size="sm" />
              {t('ask.asking')}
            </div>
            <div aria-hidden="true" data-testid="ask-skeleton">
              <PingSkeleton active title={false} paragraph={{ rows: 3 }} />
            </div>
          </div>
        )}

        <div aria-live="polite" aria-atomic="true" data-testid="ask-live">
          {status === 'done' && (
            <section
              className="max-h-96 overflow-y-auto rounded-lg border p-3 text-sm leading-relaxed"
              data-testid="ask-answer"
            >
              <h3 className="mb-1 font-medium">{t('ask.answer')}</h3>
              <p className="whitespace-pre-wrap">{answer}</p>
              {citations.length > 0 ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">{t('ask.citations')}</span>
                  {citations.map((messageId) => (
                    <PingButton
                      key={messageId}
                      size="sm"
                      variant="secondary"
                      onClick={() => onCitationClick?.(messageId, channelId)}
                      title={t('ask.goToMessage')}
                      data-testid={`ask-citation-${messageId}`}
                    >
                      <span className="font-mono">{messageId.slice(0, 8)}</span>
                      <ArrowRightIcon className="ml-1 size-3" />
                    </PingButton>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-xs text-muted-foreground">{t('ask.noCitation')}</p>
              )}
            </section>
          )}
        </div>

        {status === 'error' && errorMessage && (
          <PingAlert type="error" title={errorMessage} data-testid="ask-error" />
        )}
      </div>
    </PingDrawer>
  );
}
