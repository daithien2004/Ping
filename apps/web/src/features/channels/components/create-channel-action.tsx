'use client';
import { Can } from '@casl/react';
import type { AppAbility } from '@ping/shared';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { Button } from '@/components/ui/button';
import { useServerAbility } from '@/features/permissions/context';
import { CreateChannelDialog } from './create-channel-dialog';

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
      <Button
        variant="ghost"
        size="sm"
        disabled={!ready}
        onClick={() => setOpen(true)}
        className="justify-start text-muted-foreground"
      >
        <Plus /> {t('create')}
      </Button>
      <CreateChannelDialog serverId={serverId} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
