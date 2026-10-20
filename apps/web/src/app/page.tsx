import { Suspense } from 'react';
import { ApiStatus } from '@/features/health/api-status';

// Trang tạm cho tới F2: khi có auth, trang gốc chuyển hướng tới /login hoặc server đầu tiên.
export default function Home() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-2">
      <h1 className="text-2xl font-semibold">Ping</h1>
      <Suspense fallback={<p className="text-sm text-gray-500">Đang kiểm tra API…</p>}>
        <ApiStatus />
      </Suspense>
    </main>
  );
}
