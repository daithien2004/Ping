import { Suspense, type ReactNode } from 'react';
import { Providers } from '@/providers/providers';
import { AuthGate } from '@/features/auth/components/auth-gate';
import { SettingsSync } from '@/features/settings/components/settings-sync';
import { AppShell } from '@/features/shell/components/app-shell';
import { RealtimeProvider } from '@/features/shell/components/realtime-provider';
import { ShellSkeleton } from '@/features/shell/components/shell-skeleton';

/**
 * Khung của mọi trang cần đăng nhập. `AppShell` giữ rail + vùng nội dung (mỗi vùng một Suspense
 * riêng để đang tải nội dung vẫn bấm được rail); dưới `md` rail và sidebar gộp thành drawer.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    // Hai fallback cùng một khung: cái ngoài có mặt trong HTML tĩnh (lúc đó chưa đọc được cookie
    // ngôn ngữ), cái trong là lúc chờ phiên đăng nhập — khung hiện trước, dữ liệu lấp sau.
    <Providers fallback={<ShellSkeleton />}>
      <Suspense fallback={<ShellSkeleton />}>
        <AuthGate>
          <RealtimeProvider>
            {/* TG.13: nạp cài đặt người dùng từ server để áp dụng toàn app — đặt sau AuthGate nên
                chỉ chạy khi đã đăng nhập; chưa tải xong thì app vẽ theo mặc định. */}
            <SettingsSync />
            <AppShell>{children}</AppShell>
          </RealtimeProvider>
        </AuthGate>
      </Suspense>
    </Providers>
  );
}
