import { Suspense, type ReactNode } from 'react';
import { Loading } from '@/components/loading';
import { RailSkeleton } from '@/components/skeletons';
import { AuthGate } from '@/features/auth/components/auth-gate';
import { VerifyEmailBanner } from '@/features/auth/components/verify-email-banner';
import { SettingsSync } from '@/features/settings/components/settings-sync';
import { ServerRail } from '@/features/servers/components/server-rail';
import { RealtimeProvider } from '@/features/realtime/components/realtime-provider';
import { ConnectionBanner } from '@/features/realtime/components/connection-banner';
import { QuickSwitcher } from '@/components/quick-switcher';

/**
 * Khung của mọi trang cần đăng nhập: cột server bên trái + nội dung. Mỗi vùng có Suspense riêng:
 * vùng nội dung đang tải thì cột server vẫn bấm được (không trắng cả màn hình).
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<Loading />}>
      <AuthGate>
        <RealtimeProvider>
          {/* TG.13: nạp cài đặt người dùng từ server để áp dụng toàn app — đặt sau AuthGate nên
              chỉ chạy khi đã đăng nhập; chưa tải xong thì app vẽ theo mặc định. */}
          <SettingsSync />
          <div className="flex h-dvh flex-col">
            <ConnectionBanner />
            {/* TG.8: nhắc khi email chưa xác minh — ẩn ngay khi `me` cho biết đã xác minh. */}
            <VerifyEmailBanner />
            <QuickSwitcher items={[]} />
            <div className="flex min-h-0 min-w-[960px] flex-1">
              <Suspense fallback={<RailSkeleton />}>
                <ServerRail />
              </Suspense>
              <div className="flex min-w-0 flex-1">
                <Suspense fallback={<Loading />}>{children}</Suspense>
              </div>
            </div>
          </div>
        </RealtimeProvider>
      </AuthGate>
    </Suspense>
  );
}
