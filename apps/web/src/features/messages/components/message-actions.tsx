'use client';
import { MoreHorizontal, Pencil, Trash2 } from 'lucide-react';
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
}: {
  message: ClientMessage;
  onAction: (selection: MessageSelection) => void;
}) {
  const { ability, ready } = useServerAbility();
  const t = useTranslations('messages');
  const target = messageSubject(message);
  const canEdit = ability.can('update', target);
  const canDelete = ability.can('delete', target);
  if (message.status || (!canEdit && !canDelete)) return null;
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
