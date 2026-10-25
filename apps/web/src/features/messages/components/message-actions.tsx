'use client';
import { Link2, MoreHorizontal, Pencil, Reply, Trash2 } from 'lucide-react';
import { useTranslations } from 'use-intl';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { pingToast } from '@/components/ui/ping-toast';
import { useServerAbility } from '@/features/permissions/context';
import { messageSubject } from '@/features/permissions/ability';
import type { ClientMessage } from '../message-cache';

export interface MessageSelection {
  kind: 'edit' | 'delete';
  messageId: string;
}
export function MessageActions({
  message,
  permalink,
  onAction,
  onReply,
}: {
  message: ClientMessage;
  /** TG.5: đường dẫn tương đối của tin — "Sao chép liên kết" ghép với origin hiện tại. */
  permalink: string;
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
  // Tin optimistic chưa có id thật → chưa có permalink.
  if (message.status) return null;
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(new URL(permalink, window.location.origin).toString());
      pingToast.success(t('linkCopied'));
    } catch {
      // Clipboard bị chặn (http, thiếu quyền): không im lặng, để người dùng tự copy từ URL.
      pingToast.error(t('linkCopyFailed'));
    }
  }
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
        <DropdownMenuItem onSelect={() => void copyLink()} data-testid="copy-link">
          <Link2 />
          {t('copyLink')}
        </DropdownMenuItem>
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
