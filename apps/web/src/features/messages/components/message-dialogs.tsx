'use client';
import { useEffect, useEffectEvent } from 'react';
import { useServerAbility } from '@/features/permissions/context';
import { messageSubject } from '@/features/permissions/ability';
import type { ClientMessage } from '../message-cache';
import type { MessageSelection } from './message-actions';
import { EditMessageDialog } from './edit-message-dialog';
import { DeleteMessageDialog } from './delete-message-dialog';

export function MessageDialogs({
  selection,
  message,
  channelId,
  onClose,
}: {
  selection: MessageSelection | null;
  message: ClientMessage | undefined;
  channelId: string;
  onClose: () => void;
}) {
  const { ability } = useServerAbility();
  const permitted =
    !!message &&
    !message.status &&
    ability.can(selection?.kind === 'edit' ? 'update' : 'delete', messageSubject(message));
  const close = useEffectEvent(onClose);
  useEffect(() => {
    if (selection && !permitted) close();
  }, [selection, permitted]);
  if (!selection || !message || !permitted) return null;
  return selection.kind === 'edit' ? (
    <EditMessageDialog
      key={`edit-${message.id}`}
      message={message}
      channelId={channelId}
      onClose={onClose}
    />
  ) : (
    <DeleteMessageDialog
      key={`delete-${message.id}`}
      message={message}
      channelId={channelId}
      onClose={onClose}
    />
  );
}
