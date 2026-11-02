'use client';
import { Can } from '@casl/react';
import type { AppAbility } from '@ping/shared';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslations } from 'use-intl';
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
      {/* Discord: hàng "Tạo channel" phẳng như một mục danh sách, không phải nút có viền. */}
      <button
        type="button"
        disabled={!ready}
        onClick={() => setOpen(true)}
        className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-ring disabled:opacity-50"
      >
        <Plus className="size-5 shrink-0" />
        {t('create')}
      </button>
      <ChannelNameDialog serverId={serverId} open={open} onClose={() => setOpen(false)} />
    </>
  );
}
