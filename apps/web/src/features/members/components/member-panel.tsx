'use client';

import type { MemberDto } from '@ping/shared';
import { useTranslations } from 'use-intl';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { useErrorMessage } from '@/lib/error-message';
import { initials } from '@/lib/initials';
import { groupByPresence } from '../member-cache';
import { useMembers } from '../hooks';

function MemberRow({ member }: { member: MemberDto }) {
  const t = useTranslations('members');
  const name = member.nickname ?? member.user.displayName;
  return (
    <li className="flex items-center gap-2 rounded-md px-2 py-1.5">
      <span className="relative">
        <Avatar size="sm">
          <AvatarFallback className="text-[10px]">{initials(name)}</AvatarFallback>
        </Avatar>
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
    </li>
  );
}

function Group({ label, members }: { label: string; members: MemberDto[] }) {
  if (members.length === 0) return null;
  return (
    <section aria-label={label} className="flex flex-col gap-0.5">
      <h2 className="px-2 pt-3 pb-1 text-xs font-semibold text-muted-foreground uppercase">
        {label}
      </h2>
      <ul>
        {members.map((member) => (
          <MemberRow key={member.id} member={member} />
        ))}
      </ul>
    </section>
  );
}

/** Danh sách thành viên của server, online trước. Hiện bên phải khung chat (ẩn/hiện bằng nút ở tiêu đề). */
export function MemberPanel({ serverId }: { serverId: string }) {
  const t = useTranslations('members');
  const errorMessage = useErrorMessage();
  const query = useMembers(serverId);
  const members = query.data?.pages.flatMap((page) => page.members) ?? [];
  const { online, offline } = groupByPresence(members);

  return (
    <aside
      aria-label={t('panel')}
      className="flex w-60 shrink-0 flex-col overflow-y-auto bg-sidebar p-2"
    >
      {query.isPending && (
        <p role="status" className="p-2 text-sm text-muted-foreground">
          {t('loading')}
        </p>
      )}
      {query.isError && (
        <p role="alert" className="p-2 text-sm text-destructive">
          {errorMessage(query.error)}
        </p>
      )}
      <Group label={t('online', { count: online.length })} members={online} />
      <Group label={t('offline', { count: offline.length })} members={offline} />
      {query.hasNextPage && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-2"
          disabled={query.isFetchingNextPage}
          onClick={() => void query.fetchNextPage()}
        >
          {t('loadMore')}
        </Button>
      )}
    </aside>
  );
}
