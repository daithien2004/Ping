'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useLogout, useMe } from '@/features/auth/hooks';
import { useServers } from '../hooks';
import { serverPath } from '../navigation';
import { CreateServerDialog } from './create-server-dialog';
import { JoinServerDialog } from './join-server-dialog';

const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((word) => word[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

const railButton =
  'flex h-12 w-12 items-center justify-center rounded-2xl bg-gray-700 text-sm font-semibold text-white hover:rounded-xl hover:bg-indigo-600';

/** Cột trái: các server của tôi, tạo/tham gia server, tài khoản. */
export function ServerRail() {
  const { serverId } = useParams<{ serverId?: string }>();
  const { data: servers } = useServers();
  const { data: me } = useMe();
  const logoutMutation = useLogout();
  const [dialog, setDialog] = useState<'create' | 'join' | null>(null);
  const close = () => setDialog(null);

  return (
    <nav aria-label="Server" className="flex w-[72px] flex-col items-center gap-2 bg-gray-900 py-3">
      {servers.map((server) => (
        <Link
          key={server.id}
          href={serverPath(server.id)}
          title={server.name}
          aria-label={server.name}
          aria-current={server.id === serverId ? 'page' : undefined}
          className={`${railButton} ${server.id === serverId ? 'rounded-xl bg-indigo-600' : ''}`}
        >
          {initials(server.name)}
        </Link>
      ))}
      <button
        type="button"
        title="Tạo server"
        aria-label="Tạo server"
        onClick={() => setDialog('create')}
        className={railButton}
      >
        +
      </button>
      <button
        type="button"
        title="Tham gia server"
        aria-label="Tham gia server"
        onClick={() => setDialog('join')}
        className={railButton}
      >
        ⇥
      </button>

      <div className="mt-auto flex flex-col items-center gap-1 text-xs text-gray-300">
        <span title={me?.displayName}>{me ? initials(me.displayName) : ''}</span>
        <button
          type="button"
          onClick={() => logoutMutation.mutate()}
          disabled={logoutMutation.isPending}
          className="underline"
        >
          Thoát
        </button>
      </div>

      <CreateServerDialog open={dialog === 'create'} onClose={close} />
      <JoinServerDialog open={dialog === 'join'} onClose={close} />
    </nav>
  );
}
