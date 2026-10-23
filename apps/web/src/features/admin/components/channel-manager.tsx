'use client';

import type { ChannelDto } from '@ping/shared';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { PingButton } from '@/components/ui/ping-button';
import { PingEmpty } from '@/components/ui/ping-empty';
import { PingPopconfirm } from '@/components/ui/ping-popconfirm';
import { PingTable, type PingTableColumn } from '@/components/ui/ping-table';
import { pingToast } from '@/components/ui/ping-toast';
import { useServerAbility } from '@/features/permissions/context';
import { useErrorMessage } from '@/lib/error-message';
import { useChannels, useDeleteChannel } from '@/features/channels/hooks';
import { ChannelNameDialog } from '@/features/channels/components/channel-name-dialog';

export function ChannelManager({ serverId }: { serverId: string }) {
  const t = useTranslations('admin');
  const tc = useTranslations('common');
  const tChannels = useTranslations('channels');
  const { ability } = useServerAbility();
  const errorMessage = useErrorMessage();
  const { data: channels } = useChannels(serverId);
  const deleteMutation = useDeleteChannel(serverId);
  const [createOpen, setCreateOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState<ChannelDto | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const canManage = ability.can('manage', 'Channel');
  if (!canManage) return null;

  const columns: PingTableColumn<ChannelDto>[] = [
    {
      key: 'name',
      header: tChannels('name'),
      render: (row) => (
        <span className="flex items-center gap-1.5">
          <span className="text-lg leading-none text-muted-foreground">#</span> {row.name}
        </span>
      ),
    },
    {
      key: 'actions',
      header: t('channelActions'),
      render: (row) => (
        <div className="flex flex-wrap items-center gap-2">
          <PingButton variant="secondary" size="sm" onClick={() => setRenameTarget(row)}>
            {tChannels('rename')}
          </PingButton>
          <PingPopconfirm
            title={tChannels('deleteTitle')}
            description={tChannels('deleteDescription')}
            okText={tChannels('delete')}
            cancelText={tc('cancel')}
            onConfirm={() => {
              setDeletingId(row.id);
              deleteMutation.mutate(row.id, {
                onSuccess: () => {
                  setDeletingId(null);
                  pingToast.success(tChannels('deleted'));
                },
                onError: (error) => {
                  setDeletingId(null);
                  pingToast.error(errorMessage(error));
                },
              });
            }}
            disabled={deleteMutation.isPending}
          >
            <PingButton
              variant="danger"
              size="sm"
              loading={deleteMutation.isPending && deletingId === row.id}
              disabled={deleteMutation.isPending}
            >
              {tChannels('delete')}
            </PingButton>
          </PingPopconfirm>
        </div>
      ),
    },
  ];

  return (
    <section aria-label={t('channels')} className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{t('channels')}</h2>
        <PingButton size="sm" onClick={() => setCreateOpen(true)}>
          {tChannels('create')}
        </PingButton>
      </div>
      <PingTable
        label={t('channels')}
        columns={columns}
        rows={channels}
        rowKey={(row) => row.id}
        empty={<PingEmpty description={tChannels('empty')} />}
      />
      <ChannelNameDialog
        serverId={serverId}
        open={createOpen}
        navigateOnCreate={false}
        onClose={() => setCreateOpen(false)}
      />
      {renameTarget && (
        <ChannelNameDialog
          key={renameTarget.id}
          serverId={serverId}
          open
          channelId={renameTarget.id}
          initialName={renameTarget.name}
          onClose={() => setRenameTarget(null)}
        />
      )}
    </section>
  );
}
