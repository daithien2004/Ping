'use client';
import { MoreHorizontal, Pencil, Reply, Trash2 } from 'lucide-react';
import { useTranslations } from 'use-intl';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useServerAbility } from '@/features/permissions/context';
import { messageSubject } from '@/features/permissions/ability';
import type { ClientMessage } from '../message-cache';

export interface MessageSelection {
  kind: 'edit' | 'delete';
  messageId: string;
}
export function MessageActions({
  message,
  onAction,
  onReply,
}: {
  message: ClientMessage;
  onAction: (selection: MessageSelection) => void;
  /** TG.1: chọn tin để trả lời (không mở dialog, chỉ đặt thanh reply trong composer). */
  onReply: (message: ClientMessage) => void;
}) {
  const { ability, ready } = useServerAbility();
  const t = useTranslations('messages');
  const target = messageSubject(message);
  const canEdit = ability.can('update', target);
  const canDelete = ability.can('delete', target);
  const canReply = ability.can('create', 'Message');
  if (message.status || (!canEdit && !canDelete && !canReply)) return null;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          disabled={!ready}
          aria-label={t('actions')}
          className="ml-auto size-7"
        >
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {canReply && (
          <DropdownMenuItem onSelect={() => onReply(message)}>
            <Reply />
            {t('reply')}
          </DropdownMenuItem>
        )}
        {canEdit && (
          <DropdownMenuItem onSelect={() => onAction({ kind: 'edit', messageId: message.id })}>
            <Pencil />
            {t('edit')}
          </DropdownMenuItem>
        )}
        {canDelete && (
          <DropdownMenuItem onSelect={() => onAction({ kind: 'delete', messageId: message.id })}>
            <Trash2 />
            {t('delete')}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
