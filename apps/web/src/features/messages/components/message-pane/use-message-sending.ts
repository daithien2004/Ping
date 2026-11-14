'use client';

import { useCallback } from 'react';
import { useServerAbility } from '@/features/permissions/context';
import { useSendMessage, type SendMessageVariables } from '../../hooks';
import type { ClientMessage } from '../../message-cache';
import { toSendVariables, type OutgoingMessage } from '../message-composer/outgoing-message';
import { retryVariables } from './retry-variables';

export function useMessageSending({
  channelId,
  onSendError,
  onSubmit,
  onWillAppend,
}: {
  channelId: string;
  onSendError?: (error: unknown) => void;
  onSubmit: () => void;
  onWillAppend: () => void;
}) {
  const { ability, ready } = useServerAbility();
  const sendMutate = useSendMessage(channelId).mutate;

  const canSend = ready && ability.can('create', 'Message');

  const submit = useCallback(
    (variables: SendMessageVariables) => {
      if (!canSend) return false;
      sendMutate(variables, onSendError ? { onError: onSendError } : undefined);
      return true;
    },
    [canSend, sendMutate, onSendError],
  );

  function sendOwn(message: OutgoingMessage) {
    const variables = toSendVariables(message, crypto.randomUUID());
    if (!submit(variables)) return;
    onWillAppend();
    onSubmit();
  }

  const retry = useCallback(
    (message: ClientMessage) => {
      const plan = retryVariables(message);
      if (!plan) return;
      if (plan.kind !== 'text') onWillAppend();
      submit(plan.variables);
    },
    [submit, onWillAppend],
  );

  return { sendOwn, retry };
}
