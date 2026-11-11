'use client';
import { Link2, MoreHorizontal, Pencil, Pin, PinOff, Reply, Trash2 } from 'lucide-react';
import { useTranslations } from 'use-intl';
import { PingDropdown } from '@/components/ui/ping-dropdown';
import { PingIconButton } from '@/components/ui/ping-icon-button';
import { pingToast } from '@/components/ui/ping-toast';
import { useServerAbility } from '@/features/permissions/context';
import { messageSubject } from '@/features/permissions/ability';
import type { ClientMessage } from '../message-cache';
import { useSetPinned } from '../hooks';

export interface MessageSelection {
  kind: 'edit' | 'delete';
  messageId: string;
}
export function MessageActions({
  message,
  channelId,
  permalink,
  onAction,
  onReply,
}: {
  message: ClientMessage;
  channelId: string;
  permalink: string;
  onAction: (selection: MessageSelection) => void;
  onReply: (message: ClientMessage) => void;
}) {
  const { ability, ready } = useServerAbility();
  const t = useTranslations('messages');
  const setPinned = useSetPinned(channelId);
  const target = messageSubject(message);
  const canEdit = ability.can('update', target);
  const canDelete = ability.can('delete', target);
  const canReply = ability.can('create', 'Message');
  const canPin = ability.can('create', 'Pin');
  if (message.status) return null;
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(new URL(permalink, window.location.origin).toString());
      pingToast.success(t('linkCopied'));
    } catch {
      pingToast.error(t('linkCopyFailed'));
    }
  }
  return (
    <PingDropdown
      trigger={['click']}
      placement="bottomRight"
      menu={{
        items: [
          {
            key: 'copy-link',
            label: t('copyLink'),
            icon: <Link2 />,
            'data-testid': 'copy-link',
            onClick: () => void copyLink(),
          },
          ...(canReply
            ? [
                {
                  key: 'reply',
                  label: t('reply'),
                  icon: <Reply />,
                  onClick: () => onReply(message),
                },
              ]
            : []),
          ...(canEdit
            ? [
                {
                  key: 'edit',
                  label: t('edit'),
                  icon: <Pencil />,
                  onClick: () => onAction({ kind: 'edit', messageId: message.id }),
                },
              ]
            : []),
          ...(canPin
            ? [
                {
                  key: 'pin',
                  label: message.pinnedAt ? t('unpin') : t('pin'),
                  icon: message.pinnedAt ? <PinOff /> : <Pin />,
                  'data-testid': message.pinnedAt ? 'unpin' : 'pin',
                  disabled: !ready || setPinned.isPending,
                  onClick: () =>
                    setPinned.mutate({ messageId: message.id, pin: !message.pinnedAt }),
                },
              ]
            : []),
          ...(canDelete
            ? [
                {
                  key: 'delete',
                  label: t('delete'),
                  icon: <Trash2 />,
                  onClick: () => onAction({ kind: 'delete', messageId: message.id }),
                },
              ]
            : []),
        ],
      }}
    >
      <PingIconButton
        icon={<MoreHorizontal />}
        aria-label={t('actions')}
        disabled={!ready}
        className="ml-auto opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
      />
    </PingDropdown>
  );
}
