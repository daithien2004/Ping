'use client';

import { useRef, useState } from 'react';
import { useTranslations } from 'use-intl';
import { api } from '@/lib/api-client';
import { useErrorMessage } from '@/lib/error-message';
import { askErrorKey, parseEvent } from './ask-stream';

export type AskStatus = 'idle' | 'asking' | 'done' | 'error';

export function useAsk({ serverId, channelId }: { serverId: string; channelId: string }) {
  const t = useTranslations();
  const messageForError = useErrorMessage();
  const [status, setStatus] = useState<AskStatus>('idle');
  const [answer, setAnswer] = useState('');
  const [citations, setCitations] = useState<string[]>([]);
  const [errorMessage, setErrorMessage] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  function abort() {
    abortRef.current?.abort();
    abortRef.current = null;
  }

  function reset() {
    setAnswer('');
    setCitations([]);
    setErrorMessage('');
    setStatus('idle');
  }

  function cancel() {
    abort();
    reset();
  }

  async function ask(question: string) {
    const q = question.trim();
    if (!q) return;

    cancel();
    setStatus('asking');

    const controller = new AbortController();
    abortRef.current = controller;

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

        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';
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
            setErrorMessage(t(askErrorKey(code)));
            setStatus('error');
          }
        }
      }

      if (controller.signal.aborted) return;

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

  return { status, answer, citations, errorMessage, ask, cancel };
}
