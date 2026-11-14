'use client';

import { ServerEvents, type MentionCreatedPayload } from '@ping/shared';
import { LogIn, LogOut, MessageCircle, Plus } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslations } from 'use-intl';
import { PingAvatar } from '@/components/ui/ping-avatar';
import { PingBadge } from '@/components/ui/ping-badge';
import { PingIconButton } from '@/components/ui/ping-icon-button';
import { PingTooltip } from '@/components/ui/ping-tooltip';
import { dmUnreadTotal } from '@/features/dms/dm-cache';
import { useDms } from '@/features/dms/hooks';
import { dmsPath } from '@/features/dms/navigation';
import { useLogout } from '@/features/auth/hooks';
import { EnableNotificationsButton } from '@/features/notifications/components/enable-notifications';
import { useNotifyBadge } from '@/features/notifications/badge';
import { profileImageUrl } from '@/features/profile/hooks';
import { useRealtime } from '@/features/realtime/context';
import { onServerEvent } from '@/features/realtime/socket';
import { useUnread } from '@/features/unread/hooks';
import { totals } from '@/features/unread/unread-cache';
import { isDmPath, serverIdFromPath } from '@/lib/channel-url';
import { initials } from '@/lib/initials';
import { useServers } from '../hooks';
import { serverPath } from '../navigation';
import { OnboardingWizard, type OnboardingMode } from './onboarding-wizard';

function RailItem({
  label,
  active,
  children,
}: {
  label: string;
  active?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="group relative flex w-full justify-center">
      <span
        aria-hidden
        className={`absolute left-0 top-1/2 w-1 -translate-y-1/2 rounded-r-full bg-rail-foreground transition-all ${
          active ? 'h-10' : 'h-0 group-hover:h-5'
        }`}
      />
      <PingTooltip title={label} placement="right">
        {children}
      </PingTooltip>
    </div>
  );
}

const railIcon =
  'flex size-10 items-center justify-center rounded-full bg-secondary text-secondary-foreground transition-all hover:rounded-xl hover:brightness-110';

export function ServerRail() {
  const pathname = usePathname();
  const serverId = serverIdFromPath(pathname);
  const { data: servers } = useServers();
  const logoutMutation = useLogout();
  const [wizard, setWizard] = useState<OnboardingMode | null>(null);
  const t = useTranslations();
  useNotifyBadge('Ping');

  return (
    <nav
      aria-label={t('servers.navLabel')}
      data-mobile-nav
      data-slot="rail"
      className="flex min-h-0 w-18 shrink-0 flex-col items-center bg-rail py-2 text-rail-foreground"
    >
      <div
        data-slot="rail-list"
        className="no-scrollbar flex min-h-0 w-full flex-1 flex-col items-center gap-2 overflow-x-hidden overflow-y-auto"
      >
        <DmRailItem active={isDmPath(pathname)} />

        {servers.map((server) => (
          <ServerRailItem
            key={server.id}
            serverId={server.id}
            name={server.name}
            iconUrl={server.iconUrl}
            active={server.id === serverId}
          />
        ))}

        <div aria-hidden className="h-px w-8 shrink-0 bg-border" />

        <RailItem label={t('servers.create')}>
          <button
            type="button"
            aria-label={t('servers.create')}
            onClick={() => setWizard('create')}
            data-slot="rail-icon"
            className={`${railIcon} flex items-center justify-center`}
          >
            <Plus className="size-5" />
          </button>
        </RailItem>
        <RailItem label={t('servers.join')}>
          <button
            type="button"
            aria-label={t('servers.join')}
            onClick={() => setWizard('join')}
            data-slot="rail-icon"
            className={`${railIcon} flex items-center justify-center`}
          >
            <LogIn className="size-5" />
          </button>
        </RailItem>
      </div>

      <div data-slot="rail-footer" className="mt-2 flex w-full flex-col items-center gap-2">
        <EnableNotificationsButton />
        <RailItem label={t('auth.signOut')}>
          <PingIconButton
            icon={<LogOut />}
            aria-label={t('auth.signOut')}
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
          />
        </RailItem>
      </div>

      <OnboardingWizard
        open={wizard !== null}
        initialMode={wizard ?? undefined}
        onClose={() => setWizard(null)}
      />

      <MentionAnnouncer />
    </nav>
  );
}

function DmRailItem({ active }: { active: boolean }) {
  const t = useTranslations('dms');
  const { data: dms } = useDms();
  const unreadTotal = dmUnreadTotal(dms ?? []);
  const label = unreadTotal > 0 ? t('railLabelUnread', { count: unreadTotal }) : t('title');

  return (
    <RailItem label={label} active={active}>
      <Link
        href={dmsPath()}
        aria-label={label}
        aria-current={active ? 'page' : undefined}
        data-testid="dm-rail"
      >
        <PingBadge
          count={unreadTotal}
          color="red"
          offset={[-4, 4]}
          aria-label={unreadTotal > 0 ? t('mentionCount', { count: unreadTotal }) : undefined}
        >
          <span data-slot="rail-icon" className={`${railIcon} flex items-center justify-center`}>
            <MessageCircle className="size-5" />
          </span>
        </PingBadge>
      </Link>
    </RailItem>
  );
}

function ServerRailItem({
  serverId,
  name,
  iconUrl,
  active,
}: {
  serverId: string;
  name: string;
  iconUrl: string | null;
  active: boolean;
}) {
  const t = useTranslations('servers');
  const { data: unread } = useUnread(serverId);
  const { unreadTotal, mentionTotal } = totals(unread ?? []);
  const label =
    mentionTotal > 0
      ? t('railLabelMention', { name, count: mentionTotal })
      : unreadTotal > 0
        ? t('railLabelUnread', { name, count: unreadTotal })
        : name;
  const showMention = mentionTotal > 0;
  const showUnread = unreadTotal > 0 && !showMention;

  return (
    <RailItem label={label} active={active}>
      <Link
        href={serverPath(serverId)}
        aria-label={label}
        aria-current={active ? 'page' : undefined}
      >
        <PingBadge
          count={showMention ? mentionTotal : 0}
          color="red"
          offset={[-4, 4]}
          aria-label={showMention ? t('mentionCount', { count: mentionTotal }) : undefined}
        >
          <PingBadge
            dot={showUnread}
            color={showUnread ? 'var(--muted-foreground)' : undefined}
            offset={[-4, 4]}
          >
            {/* antd CSS ngoài layer Tailwind đè class `bg-*`/`rounded-*`; đặt màu/bo góc qua `style` (vẫn là token). */}
            <PingAvatar
              size={40}
              data-slot="rail-icon"
              data-active={active ? 'true' : undefined}
              src={profileImageUrl(iconUrl)}
              alt={name}
              style={{
                background: 'var(--ping-avatar-bg, var(--secondary))',
                color: 'var(--ping-avatar-fg, var(--secondary-foreground))',
                borderRadius: 'var(--rail-icon-radius, var(--ping-radius-full))',
              }}
              className="transition-all"
            >
              {initials(name)}
            </PingAvatar>
          </PingBadge>
        </PingBadge>
      </Link>
    </RailItem>
  );
}

function MentionAnnouncer() {
  const session = useRealtime();
  const t = useTranslations('servers');
  const { data: servers } = useServers();
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    const handler = (event: MentionCreatedPayload) => {
      const name = servers.find((server) => server.id === event.serverId)?.name;
      setAnnouncement(name ? t('mentionAnnounce', { server: name }) : t('mentionAnnounceGeneric'));
    };
    return onServerEvent(session.socket, ServerEvents.MentionCreated, handler);
  }, [session, servers, t]);

  return (
    <p aria-live="polite" data-testid="mention-announcer" className="sr-only">
      {announcement}
    </p>
  );
}
