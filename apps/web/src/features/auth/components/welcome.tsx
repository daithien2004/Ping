'use client';

import { useLogout, useMe } from '../hooks';

/** Nằm dưới AuthGate: `me` chắc chắn có giá trị và component chỉ chạy trong trình duyệt. */
export function Welcome() {
  const { data: me } = useMe();
  const logoutMutation = useLogout();

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-semibold">Xin chào, {me?.displayName}</h1>
      <button
        type="button"
        onClick={() => logoutMutation.mutate()}
        disabled={logoutMutation.isPending}
        className="rounded border border-gray-300 px-3 py-2 text-sm dark:border-gray-600"
      >
        Đăng xuất
      </button>
    </main>
  );
}
