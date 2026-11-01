import { Suspense, type ReactNode } from 'react';
import { Loading } from '@/components/loading';
import { AuthGate } from '@/features/auth/components/auth-gate';
import { SettingsSync } from '@/features/settings/components/settings-sync';
import { RealtimeProvider } from '@/features/realtime/components/realtime-provider';
import { AppShell } from '@/features/shell/components/app-shell';

/**
 * Khung của mọi trang cần đăng nhập. `AppShell` giữ rail + vùng nội dung (mỗi vùng một Suspense
 * riêng để đang tải nội dung vẫn bấm được rail); dưới `md` rail và sidebar gộp thành drawer.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<Loading />}>
      <AuthGate>
        <RealtimeProvider>
          {/* TG.13: nạp cài đặt người dùng từ server để áp dụng toàn app — đặt sau AuthGate nên
              chỉ chạy khi đã đăng nhập; chưa tải xong thì app vẽ theo mặc định. */}
          <SettingsSync />
          <AppShell>{children}</AppShell>
        </RealtimeProvider>
      </AuthGate>
    </Suspense>
  );
}
