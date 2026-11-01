'use client';

import dynamic from 'next/dynamic';
import { useParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { useTranslations } from 'use-intl';
import type { QuickSwitcherItem } from '@/components/quick-switcher';
import { useChannels } from '@/features/channels/hooks';
import { sortedDms } from '@/features/dms/dm-cache';
import { useDms } from '@/features/dms/hooks';
import { dmPath } from '@/features/dms/navigation';
import { useServers } from '@/features/servers/hooks';
import { channelPath, serverPath } from '@/features/servers/navigation';

// Tải lười: chunk của modal chỉ được tải ở lần bấm Ctrl/Cmd+K đầu tiên (T6.10).
const LazyQuickSwitcher = dynamic(
  () => import('@/components/quick-switcher').then((module) => module.QuickSwitcher),
  { ssr: false },
);

/**
 * Cầu nối dữ liệu cho quick switcher (TF.5): server của tôi, hội thoại DM và kênh của server
 * đang mở. Ctrl/Cmd+K do component này bắt (không phải modal) để lần mở đầu mới tải chunk modal.
 */
export function QuickSwitcherHost() {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && (event.key === 'k' || event.key === 'K')) {
        event.preventDefault();
        setMounted(true);
        setOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Đóng là tháo hẳn modal: mở lại luôn bắt đầu với ô tìm kiếm trống (state nằm trong modal).
  if (!mounted || !open) return null;
  return (
    <Suspense fallback={null}>
      <QuickSwitcherData open onOpenChange={setOpen} />
    </Suspense>
  );
}

function QuickSwitcherData({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: servers } = useServers();
  const { data: dms } = useDms();
  const { serverId } = useParams<{ serverId?: string }>();
  const t = useTranslations('quickSwitcher');

  const base: QuickSwitcherItem[] = [
    ...servers.map((server) => ({
      id: `server:${server.id}`,
      label: server.name,
      href: serverPath(server.id),
      group: t('servers'),
    })),
    ...sortedDms(dms ?? []).map((dm) => ({
      id: `dm:${dm.channelId}`,
      label: dm.partner.displayName,
      href: dmPath(dm.channelId),
      group: t('dms'),
    })),
  ];

  return serverId ? (
    <WithChannels serverId={serverId} base={base} open={open} onOpenChange={onOpenChange} />
  ) : (
    <LazyQuickSwitcher items={base} open={open} onOpenChange={onOpenChange} />
  );
}

function WithChannels({
  serverId,
  base,
  open,
  onOpenChange,
}: {
  serverId: string;
  base: QuickSwitcherItem[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: channels } = useChannels(serverId);
  const t = useTranslations('quickSwitcher');
  const items = [
    ...base,
    ...channels.map((channel) => ({
      id: `channel:${channel.id}`,
      label: `# ${channel.name}`,
      href: channelPath(serverId, channel.id),
      group: t('channels'),
    })),
  ];
  return <LazyQuickSwitcher items={items} open={open} onOpenChange={onOpenChange} />;
}
