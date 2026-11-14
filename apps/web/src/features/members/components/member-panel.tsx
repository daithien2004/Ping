'use client';

import type { MemberDto } from '@ping/shared';
import { useTranslations } from 'use-intl';
import { useState } from 'react';
import { PingButton } from '@/components/ui/ping-button';
import { PingModal } from '@/components/ui/ping-modal';
import { PingSkeleton } from '@/components/ui/ping-skeleton';
import { useMe } from '@/features/auth/hooks';
import { MemberProfileCard } from '@/features/profile/components/profile-popover';
import { UserAvatar } from '@/features/profile/components/user-avatar';
import { errorReference } from '@/lib/error-reference';
import { useErrorMessage } from '@/lib/error-message';
import { groupByPresence } from '../member-cache';
import { useMembers } from '../hooks';

function MemberRow({
  member,
  serverId,
  self,
}: {
  member: MemberDto;
  serverId: string;
  self: boolean;
}) {
  const t = useTranslations('members');
  const tp = useTranslations('profile');
  const name = member.nickname ?? member.user.displayName;
  const [open, setOpen] = useState(false);
  return (
    <li data-slot="member-row" className="flex items-center rounded-md px-2 py-1.5">
      <button
        type="button"
        data-testid="member-row"
        aria-haspopup="dialog"
        className="flex w-full items-center gap-2 rounded-md text-left focus-ring"
        onClick={() => setOpen(true)}
      >
        <span className="relative">
          <UserAvatar name={name} avatarUrl={member.user.avatarUrl} size="sm" />
          <span
            aria-hidden
            className={`absolute -right-0.5 -bottom-0.5 size-2.5 rounded-full ring-2 ring-sidebar ${
              member.online ? 'bg-online' : 'bg-muted-foreground'
            }`}
          />
        </span>
        <span className={`truncate text-sm ${member.online ? '' : 'text-muted-foreground'}`}>
          {name}
        </span>
        <span className="sr-only">{member.online ? t('statusOnline') : t('statusOffline')}</span>
      </button>
      <PingModal
        title={tp('selfTitle', { name })}
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        destroyOnHidden
      >
        <MemberProfileCard
          member={member}
          serverId={serverId}
          self={self}
          onDone={() => setOpen(false)}
        />
      </PingModal>
    </li>
  );
}

function Group({
  label,
  members,
  serverId,
  selfId,
}: {
  label: string;
  members: MemberDto[];
  serverId: string;
  selfId: string | undefined;
}) {
  if (members.length === 0) return null;
  return (
    <section aria-label={label} className="flex flex-col gap-0.5">
      <h2 className="px-2 pt-3 pb-1 text-xs font-semibold text-muted-foreground uppercase">
        {label}
      </h2>
      <ul>
        {members.map((member) => (
          <MemberRow
            key={member.id}
            member={member}
            serverId={serverId}
            self={member.userId === selfId}
          />
        ))}
      </ul>
    </section>
  );
}

export function MemberPanel({ serverId }: { serverId: string }) {
  const t = useTranslations('members');
  const ta = useTranslations('app');
  const tc = useTranslations('common');
  const errorMessage = useErrorMessage();
  const query = useMembers(serverId);
  const { data: me } = useMe();
  const members = query.data?.pages.flatMap((page) => page.members) ?? [];
  const { online, offline } = groupByPresence(members);
  const message = query.isError ? errorMessage(query.error) : '';
  const reference = query.isError ? errorReference(query.error) : undefined;

  return (
    <aside
      aria-label={t('panel')}
      data-slot="members"
      className="flex w-60 shrink-0 flex-col overflow-y-auto bg-sidebar p-2 max-lg:absolute max-lg:top-header max-lg:right-0 max-lg:bottom-0 max-lg:z-20 max-lg:shadow-overlay"
    >
      {query.isPending && (
        <div
          role="status"
          aria-busy="true"
          aria-label={t('loading')}
          className="flex flex-col gap-2 p-2"
        >
          <PingSkeleton block className="h-5 w-16" />
          {[0, 1, 2, 3].map((index) => (
            <div key={index} className="flex items-center gap-2 px-1 py-1.5">
              <PingSkeleton block className="size-8 rounded-full" />
              <PingSkeleton block className="h-4 w-20" />
            </div>
          ))}
          <PingSkeleton block className="mt-2 h-5 w-16" />
          {[0, 1].map((index) => (
            <div key={index} className="flex items-center gap-2 px-1 py-1.5">
              <PingSkeleton block className="size-8 rounded-full" />
              <PingSkeleton block className="h-4 w-16" />
            </div>
          ))}
        </div>
      )}
      {query.isError && (
        <div role="alert" className="flex flex-col items-start gap-2 p-2 text-sm text-destructive">
          <p>{message}</p>
          {reference && !message.includes(reference) && (
            <p className="text-xs text-muted-foreground">
              <code className="select-all">{ta('errorId', { id: reference })}</code>
            </p>
          )}
          <PingButton
            variant="secondary"
            size="sm"
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            {tc('retry')}
          </PingButton>
        </div>
      )}
      {!query.isPending && !query.isError && members.length === 0 && (
        <p role="status" className="px-2 py-1.5 text-sm text-muted-foreground">
          {t('empty')}
        </p>
      )}
      <Group
        label={t('online', { count: online.length })}
        members={online}
        serverId={serverId}
        selfId={me?.id}
      />
      <Group
        label={t('offline', { count: offline.length })}
        members={offline}
        serverId={serverId}
        selfId={me?.id}
      />
      {query.hasNextPage && (
        <PingButton
          variant="ghost"
          size="sm"
          className="mt-2"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {t('loadMore')}
        </PingButton>
      )}
    </aside>
  );
}
