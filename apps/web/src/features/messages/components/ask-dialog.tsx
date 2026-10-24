'use client';

import { useCallback, useRef, useState } from 'react';
import { useTranslations } from 'use-intl';
import { ArrowRightIcon, BotIcon, SendIcon } from 'lucide-react';
import { api } from '@/lib/api-client';
import { useErrorMessage } from '@/lib/error-message';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PingAlert } from '@/components/ui/ping-alert';
import { PingSpinner } from '@/components/ui/ping-spinner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';

export interface AskDialogProps {
  serverId: string;
  channelId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Bấm vào một trích dẫn để nhảy tới tin gốc (id tin, channelId của tin nếu biết). */
  onCitationClick?: (messageId: string, channelId?: string) => void;
}

type AskStatus = 'idle' | 'asking' | 'done' | 'error';

/**
 * Dialog hỏi AI về lịch sử kênh (T5.6).
 *
 * Gọi `POST /servers/:serverId/ask` (SSE text/event-stream), hiển thị câu trả lời
 * văn bản thuần cùng các trích dẫn (citation) dưới dạng chip. Câu trả lời chỉ được
 * hiển thị khi API trả về `done` kèm ít nhất một trích dẫn hợp lệ (fail-closed,
 * ADR-0048 + guardrails AI). Người dùng có thể hủy giữa chừng.
 */
export function AskDialog({
  serverId,
  channelId,
  open,
  onOpenChange,
  onCitationClick,
}: AskDialogProps) {
  const t = useTranslations();
  const messageForError = useErrorMessage();
  const [question, setQuestion] = useState('');
  const [status, setStatus] = useState<AskStatus>('idle');
  const [answer, setAnswer] = useState('');
  const [citations, setCitations] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const isAsking = status === 'asking';

  const abort = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const reset = useCallback(() => {
    setAnswer('');
    setCitations([]);
    setErrorMessage('');
    setStatus('idle');
  }, []);

  /** Đóng dialog (nút, Esc, bấm ra ngoài) luôn hủy request đang chạy. */
  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) {
        abort();
        reset();
      }
      onOpenChange(next);
    },
    [abort, reset, onOpenChange],
  );

  const cancel = useCallback(() => {
    abort();
    reset();
  }, [abort, reset]);

  function messageForCode(code: string | undefined): string {
    switch (code) {
      case 'AI_INSUFFICIENT_CONTEXT':
        return t('ask.insufficient');
      case 'AI_NO_CITATION':
        return t('ask.noCitation');
      case 'AI_UNAVAILABLE':
        return t('ask.unavailable');
      case 'AI_RETRIEVAL_FAILED':
        return t('ask.retrievalFailed');
      case 'AI_INVALID_QUESTION':
        return t('ask.invalidQuestion');
      default:
        return t('ask.error');
    }
  }

  async function ask() {
    const q = question.trim();
    if (!q) return;

    abort();
    reset();
    setStatus('asking');

    const controller = new AbortController();
    abortRef.current = controller;

    // Theo dõi cục bộ: state trong closure sẽ cũ, không dùng để quyết định cuối stream.
    let streamed = '';
    let finished = false;
    let failed = false;

    try {
      const res = await api.stream(
        'POST',
        `/servers/${serverId}/ask`,
        { question: q, channelId },
        { signal: controller.signal, headers: { Accept: 'text/event-stream' } },
      );
      if (!res.body) {
        throw new Error('ask failed');
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (!controller.signal.aborted) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        // Mỗi sự kiện SSE kết thúc bằng một dòng trống.
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? ''; // phần cuối có thể chưa đủ
        for (const part of parts) {
          const event = parseEvent(part);
          if (!event) continue;

          if (event.type === 'delta') {
            const text = typeof event.data.text === 'string' ? event.data.text : '';
            streamed += text;
            setAnswer(streamed);
          } else if (event.type === 'done') {
            finished = true;
            const ids = Array.isArray(event.data.citations) ? event.data.citations : [];
            setCitations(ids.filter((id): id is string => typeof id === 'string'));
            setStatus('done');
          } else if (event.type === 'error') {
            failed = true;
            const code = typeof event.data.code === 'string' ? event.data.code : undefined;
            setErrorMessage(messageForCode(code));
            setStatus('error');
          }
        }
      }

      if (controller.signal.aborted) return;

      // Stream đóng mà không có `done`: không bao giờ hiển thị câu trả lời chưa được xác nhận.
      if (!finished && !failed) {
        setErrorMessage(t('ask.noCitation'));
        setStatus('error');
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      setErrorMessage(messageForError(error));
      setStatus('error');
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          aria-label={t('ask.title')}
          data-testid="ask-ai-button"
        >
          <BotIcon className="mr-1.5 size-4" />
          {t('ask.askButton')}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={t('common.close')} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('ask.title')}</DialogTitle>
          <DialogDescription>{t('ask.placeholder')}</DialogDescription>
        </DialogHeader>

        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void ask();
          }}
        >
          <Input
            type="text"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder={t('ask.placeholder')}
            disabled={isAsking}
            data-testid="ask-input"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!question.trim() || isAsking}
            aria-label={t('ask.askButton')}
            data-testid="ask-send"
          >
            <SendIcon />
          </Button>
        </form>

        {isAsking && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <PingSpinner size="small" />
            {t('ask.asking')}
          </p>
        )}

        {status === 'error' && errorMessage && (
          <PingAlert type="error" message={errorMessage} data-testid="ask-error" />
        )}

        {status === 'done' && (
          <section
            className="max-h-96 overflow-y-auto rounded-lg border p-3 text-sm leading-relaxed"
            data-testid="ask-answer"
          >
            <h3 className="mb-1 font-medium">{t('ask.answer')}</h3>
            {/* Văn bản thuần: không render Markdown/HTML từ model. */}
            <p className="whitespace-pre-wrap">{answer}</p>
            {citations.length > 0 ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted-foreground">{t('ask.citations')}</span>
                {citations.map((messageId) => (
                  <Button
                    key={messageId}
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => onCitationClick?.(messageId, channelId)}
                    title={t('ask.goToMessage')}
                    data-testid={`ask-citation-${messageId}`}
                  >
                    <span className="font-mono">{messageId.slice(0, 8)}</span>
                    <ArrowRightIcon className="ml-1 size-3" />
                  </Button>
                ))}
              </div>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">{t('ask.noCitation')}</p>
            )}
          </section>
        )}

        <DialogFooter>
          {isAsking ? (
            <Button type="button" variant="outline" onClick={cancel} data-testid="ask-cancel">
              {t('common.cancel')}
            </Button>
          ) : (
            <Button
              type="button"
              variant="outline"
              onClick={() => handleOpenChange(false)}
              data-testid="ask-close"
            >
              {t('common.close')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Tách một khối SSE thành `{ type, data }`; trả null nếu khối rỗng hoặc JSON hỏng. */
function parseEvent(chunk: string): { type: string; data: Record<string, unknown> } | null {
  const lines = chunk.split('\n');
  let type = 'message';
  const dataLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith('event:')) type = line.slice('event:'.length).trim();
    else if (line.startsWith('data:')) dataLines.push(line.slice('data:'.length).trimStart());
  }
  if (dataLines.length === 0) return null;
  try {
    const data: unknown = JSON.parse(dataLines.join('\n'));
    if (typeof data !== 'object' || data === null) return null;
    return { type, data: data as Record<string, unknown> };
  } catch {
    return null;
  }
}
