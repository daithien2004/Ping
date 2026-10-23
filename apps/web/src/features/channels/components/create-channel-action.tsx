'use client';
import { Can } from '@casl/react';
import type { AppAbility } from '@ping/shared';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { PingButton } from '@/components/ui/ping-button';
import { useServerAbility } from '@/features/permissions/context';
import { ChannelNameDialog } from './channel-name-dialog';

export function CreateChannelAction({ serverId }: { serverId: string }) {
  return (
    <Can<AppAbility> I="create" a="Channel">
      <CreateChannelButton serverId={serverId} />
    </Can>
  );
}

function CreateChannelButton({ serverId }: { serverId: string }) {
  const [open, setOpen] = useState(false);
  const { ready } = useServerAbility();
  const t = useTranslations('channels');
  return (
    <>
      <PingButton
        variant="ghost"
        size="sm"
        disabled={!ready}
        onClick={() => setOpen(true)}
        className="justify-start text-muted-foreground"
      >
        <Plus /> {t('create')}
      </PingButton>
      <ChannelNameDialog serverId={serverId} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
