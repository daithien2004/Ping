'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useServers } from '../hooks';
import { homePath } from '../navigation';
import { CreateServerDialog } from './create-server-dialog';
import { JoinServerDialog } from './join-server-dialog';

/** "/": có server thì vào server đầu tiên, chưa có thì mời tạo hoặc tham gia. */
export function HomeRedirect() {
  const router = useRouter();
  const { data: servers } = useServers();
  const target = homePath(servers);
  const [dialog, setDialog] = useState<'create' | 'join' | null>(null);

  useEffect(() => {
    if (target) router.replace(target);
  }, [target, router]);

  if (target) return null;

  return (
    <div className="m-auto flex flex-col items-center gap-4 text-center">
      <h1 className="text-xl font-semibold">Bạn chưa ở trong server nào</h1>
      <p className="text-sm text-gray-500">Tạo server của riêng bạn hoặc tham gia bằng mã mời.</p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => setDialog('create')}
          className="rounded bg-indigo-600 px-3 py-2 text-sm font-medium text-white"
        >
          Tạo server
        </button>
        <button
          type="button"
          onClick={() => setDialog('join')}
          className="rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-600"
        >
          Nhập mã mời
        </button>
      </div>
      <CreateServerDialog open={dialog === 'create'} onClose={() => setDialog(null)} />
      <JoinServerDialog open={dialog === 'join'} onClose={() => setDialog(null)} />
    </div>
  );
}
