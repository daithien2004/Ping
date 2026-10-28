'use client';

import { ServerEvents, type MentionCreatedPayload } from '@ping/shared';
import { LogIn, LogOut, MessageCircle, Plus } from 'lucide-react';
import Link from 'next/link';
import { useParams, usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslations } from 'use-intl';
import { LanguageSwitcher } from '@/components/language-switcher';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { PingBadge } from '@/components/ui/ping-badge';
import { PingModal } from '@/components/ui/ping-modal';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { dmUnreadTotal } from '@/features/dms/dm-cache';
import { useDms } from '@/features/dms/hooks';
import { dmsPath } from '@/features/dms/navigation';
import { useLogout, useMe } from '@/features/auth/hooks';
import { EnableNotificationsButton } from '@/features/notifications/components/enable-notifications';
import { useNotifyBadge } from '@/features/notifications/badge';
import { SelfProfileCard } from '@/features/profile/components/profile-popover';
import { profileImageUrl } from '@/features/profile/hooks';
import { UserAvatar } from '@/features/profile/components/user-avatar';
import { useRealtime } from '@/features/realtime/context';
import { useUnread } from '@/features/unread/hooks';
import { totals } from '@/features/unread/unread-cache';
import { initials } from '@/lib/initials';
import { useServers } from '../hooks';
import { serverPath } from '../navigation';
import { OnboardingWizard, type OnboardingMode } from './onboarding-wizard';

/** Một mục trên rail: tooltip bên phải + thanh chỉ báo bên trái khi đang chọn (kiểu app chat). */
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
      <Tooltip>
        <TooltipTrigger asChild>{children}</TooltipTrigger>
        <TooltipContent side="right">{label}</TooltipContent>
      </Tooltip>
    </div>
  );
}

const railIcon =
  'size-12 rounded-3xl bg-background text-foreground transition-all hover:rounded-2xl hover:bg-primary hover:text-primary-foreground';

/** Cột trái: mục DM, các server của tôi, tạo/tham gia server, tài khoản. */
export function ServerRail() {
  const { serverId } = useParams<{ serverId?: string }>();
  const pathname = usePathname();
  const { data: servers } = useServers();
  const { data: me } = useMe();
  const logoutMutation = useLogout();
  const [wizard, setWizard] = useState<OnboardingMode | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const t = useTranslations();
  // TG.12: tab title + favicon theo tổng unread mọi server + DM (trước đây chỉ tổng mention).
  useNotifyBadge(
    servers.map((server) => server.id),
    'Ping',
  );

  return (
    <nav
      aria-label={t('servers.navLabel')}
      className="flex w-18 shrink-0 flex-col items-center gap-2 bg-rail py-3 text-rail-foreground"
    >
      {/* TG.9: mục "Tin nhắn trực tiếp" nằm trên cùng của rail (như trang chủ Discord) — ngoài
          ChannelSidebar per-server theo ADR-0070 mục 7. */}
      <DmRailItem active={pathname.startsWith('/dms')} />

      {servers.map((server) => (
        <ServerRailItem
          key={server.id}
          serverId={server.id}
          name={server.name}
          iconUrl={server.iconUrl}
          active={server.id === serverId}
        />
      ))}

      <div aria-hidden className="h-px w-8 bg-border" />

      <RailItem label={t('servers.create')}>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('servers.create')}
          onClick={() => setWizard('create')}
          className={railIcon}
        >
          <Plus className="size-5" />
        </Button>
      </RailItem>
      <RailItem label={t('servers.join')}>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('servers.join')}
          onClick={() => setWizard('join')}
          className={railIcon}
        >
          <LogIn className="size-5" />
        </Button>
      </RailItem>

      <div className="mt-auto flex flex-col items-center gap-2">
        {/* TG.12: xin quyền Notification sau thao tác người dùng — chỉ hiện khi còn 'default'. */}
        <EnableNotificationsButton />
        <LanguageSwitcher compact />
        {/* TG.7: bấm vào avatar mở thẻ hồ sơ (PingModal — đặt vị trí của popover bị lệch trong
            layout rail); đổi ảnh đại diện/tên hiển thị không cần trang cài đặt. */}
        <button
          type="button"
          aria-label={me ? t('profile.openSelfProfile') : undefined}
          aria-haspopup="dialog"
          data-testid="self-avatar"
          className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => setProfileOpen(true)}
        >
          <UserAvatar name={me?.displayName ?? ''} avatarUrl={me?.avatarUrl} className="size-9" />
        </button>
        <RailItem label={t('auth.signOut')}>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('auth.signOut')}
            onClick={() => logoutMutation.mutate()}
            disabled={logoutMutation.isPending}
          >
            <LogOut />
          </Button>
        </RailItem>
      </div>

      <OnboardingWizard
        open={wizard !== null}
        initialMode={wizard ?? undefined}
        onClose={() => setWizard(null)}
      />

      {/* TG.7: thẻ hồ sơ của chính mình trong modal — luôn nằm trong viewport. */}
      <PingModal
        title={me ? t('profile.selfTitle', { name: me.displayName }) : undefined}
        open={profileOpen}
        onCancel={() => setProfileOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <SelfProfileCard />
      </PingModal>

      {/* T4.3: mình được nhắc ở kênh không đang xem — trình đọc màn hình đọc lên một lần. */}
      <MentionAnnouncer />
    </nav>
  );
}

/**
 * Mục "Tin nhắn trực tiếp" trên rail (TG.9): badge đỏ tổng unread mọi DM — mọi tin DM đều
 * mention-style (ADR-0070 mục 7) nên chỉ một mức badge, khác server (mention đỏ + chấm xám).
 * Cache `qk.dms` được `useDmEvents` cập nhật realtime nên badge đổi ngay không reload.
 */
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
          <span className={`${railIcon} flex items-center justify-center`}>
            <MessageCircle className="size-5" />
          </span>
        </PingBadge>
      </Link>
    </RailItem>
  );
}

/**
 * Một server trên rail kèm badge unread (T4.3): mention > 0 → badge đỏ số mention; còn lại
 * unread > 0 → chấm xám. Nhãn aria gộp số để trình đọc màn hình đọc đủ thông tin.
 */ function ServerRailItem({
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

  return (
    <RailItem label={label} active={active}>
      <Link
        href={serverPath(serverId)}
        aria-label={label}
        aria-current={active ? 'page' : undefined}
      >
        <PingBadge
          count={mentionTotal > 0 ? mentionTotal : 0}
          color="red"
          offset={[-4, 4]}
          aria-label={mentionTotal > 0 ? t('mentionCount', { count: mentionTotal }) : undefined}
        >
          <PingBadge
            count={unreadTotal > 0 && mentionTotal === 0 ? unreadTotal : 0}
            offset={[-4, 4]}
          >
            {/* TG.7: icon server (nếu có) đè lên fallback chữ cái; ảnh reencode WebP qua pipeline TG.6. */}
            <Avatar
              className={`size-12 transition-all ${active ? 'rounded-2xl' : 'rounded-3xl hover:rounded-2xl'}`}
            >
              <AvatarImage src={profileImageUrl(iconUrl)} alt={name} />
              <AvatarFallback
                className={`rounded-[inherit] text-sm font-semibold ${
                  active ? 'bg-primary text-primary-foreground' : 'bg-background'
                }`}
              >
                {initials(name)}
              </AvatarFallback>
            </Avatar>
          </PingBadge>
        </PingBadge>
      </Link>
    </RailItem>
  );
}

/** Vùng aria-live ẩn về mặt thị giác: đọc "bạn đã được nhắc trong server X" cho mention ngoài kênh đang xem. */
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
    session.socket.on(ServerEvents.MentionCreated, handler);
    return () => {
      session.socket.off(ServerEvents.MentionCreated, handler);
    };
  }, [session, servers, t]);

  return (
    <p aria-live="polite" data-testid="mention-announcer" className="sr-only">
      {announcement}
    </p>
  );
}
