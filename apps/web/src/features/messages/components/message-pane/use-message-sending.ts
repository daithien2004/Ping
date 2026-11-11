'use client';

import { useCallback, useRef } from 'react';
import { useServerAbility } from '@/features/permissions/context';
import { useSendMessage, type SendMessageVariables } from '../../hooks';
import type { ClientMessage } from '../../message-cache';
import { toSendVariables, type OutgoingMessage } from '../message-composer/outgoing-message';
import { retryVariables } from './retry-variables';

/**
 * Gom thao tác gửi tin mới và thử gửi lại tin lỗi trong channel.
 * Ví dụ: gọi `sendOwn(message)` để gửi tin; hook kiểm tra quyền, cập nhật cờ cuộn xuống,
 * rồi gọi `onSubmit`. Gọi `retry(message)` để thử gửi lại tin đã thất bại.
 * Trả về `{ sendOwn, retry, scrollOnAppend }` cho giao diện gọi và điều khiển cuộn.
 */
export function useMessageSending({
  channelId,
  onSendError,
  onSubmit,
}: {
  channelId: string;
  onSendError?: (error: unknown) => void;
  onSubmit: () => void;
}) {
  const { ability, ready } = useServerAbility();
  const sendMutate = useSendMessage(channelId).mutate;
  const scrollOnAppend = useRef(false);

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
    scrollOnAppend.current = true;
    onSubmit();
  }

  const retry = useCallback(
    (message: ClientMessage) => {
      const plan = retryVariables(message);
      if (!plan) return;
      if (plan.kind !== 'text') scrollOnAppend.current = true;
      submit(plan.variables);
    },
    [submit],
  );

  return { sendOwn, retry, scrollOnAppend };
}
