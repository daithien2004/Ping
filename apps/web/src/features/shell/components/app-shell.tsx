'use client';

import { Menu } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { Suspense, useEffect, type ReactNode } from 'react';
import { useTranslations } from 'use-intl';
import { cn } from 'cn';
import { Loading } from '@/components/loading';
import { RailSkeleton } from '@/features/servers/components/rail-skeleton';
import { PingIconButton } from '@/components/ui/ping-icon-button';
import { ConnectionBanner } from '@/features/realtime/components/connection-banner';
import { VerifyEmailBanner } from '@/features/auth/components/verify-email-banner';
import { ServerRail } from '@/features/servers/components/server-rail';
import { useMobileNav } from '../store';
import { QuickSwitcherHost } from './quick-switcher-host';

const TOGGLE_ID = 'mobile-nav-toggle';

/**
 * Khung app có đăng nhập (T6.8). Desktop giữ rail + sidebar cạnh nhau; dưới `md` rail và sidebar
 * thành một drawer chung sau thanh trên 48px. Drawer khoá focus trong chính nó, đóng bằng Esc,
 * backdrop hoặc khi đổi route; mở rộng cửa sổ qua `md` thì tự đóng.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const open = useMobileNav((state) => state.open);
  const setOpen = useMobileNav((state) => state.setOpen);
  const close = useMobileNav((state) => state.close);
  const pathname = usePathname();
  const t = useTranslations('common');

  useEffect(() => {
    close();
  }, [pathname, close]);

  useEffect(() => {
    const media = window.matchMedia('(min-width: 768px)');
    const onChange = () => {
      if (media.matches) close();
    };
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [close]);

  useEffect(() => {
    if (!open) return;
    const panel = document.getElementById('mobile-nav');
    panel?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
        document.getElementById(TOGGLE_ID)?.focus();
        return;
      }
      if (event.key !== 'Tab') return;
      // Rail và sidebar là hai nhánh DOM khác nhau (layout server + layout kênh), nên giữ focus
      // bằng danh sách focusable của cả hai thay vì một focus-trap lồng nhau.
      const focusable = Array.from(
        document.querySelectorAll<HTMLElement>(
          '[data-mobile-nav] a[href], [data-mobile-nav] button:not([disabled]), [data-mobile-nav] [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((node) => node.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (
        event.shiftKey &&
        (document.activeElement === first || document.activeElement === panel)
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, close]);

  function closeAndFocus() {
    close();
    document.getElementById(TOGGLE_ID)?.focus();
  }

  return (
    // Trang không được cuộn: nếu nội dung con rộng hơn cửa sổ, scrollbar của trang xuất hiện
    // và Windows lấy mất 17 px chiều cao → `h-dvh` tràn → thêm scrollbar dọc (layout giật).
    <div data-app-shell className="flex h-dvh flex-col overflow-hidden">
      <ConnectionBanner />
      <VerifyEmailBanner />
      <QuickSwitcherHost />
      <header className="flex h-12 shrink-0 items-center gap-2 border-b bg-background px-2 md:hidden">
        <PingIconButton
          id={TOGGLE_ID}
          data-testid="mobile-nav-toggle"
          icon={<Menu />}
          aria-label={open ? t('closeNavigation') : t('openNavigation')}
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        />
        <span className="font-semibold">Ping</span>
      </header>
      <div className="relative flex min-h-0 flex-1">
        {open && (
          <button
            type="button"
            aria-label={t('closeNavigation')}
            tabIndex={-1}
            onClick={closeAndFocus}
            className="absolute inset-0 z-30 bg-scrim md:hidden"
          />
        )}
        <div
          id="mobile-nav"
          tabIndex={-1}
          className={cn(
            // Đặt absolute trong hàng nội dung (đã ở dưới banner + thanh trên) nên drawer luôn
            // khớp chiều cao còn lại, kể cả khi banner đẩy thanh trên xuống.
            'flex shrink-0 max-md:absolute max-md:inset-y-0 max-md:left-0 max-md:z-30 max-md:shadow-overlay max-md:transition-transform max-md:duration-200 max-md:outline-none',
            open
              ? 'max-md:visible max-md:translate-x-0'
              : 'max-md:invisible max-md:-translate-x-full',
          )}
        >
          <Suspense fallback={<RailSkeleton />}>
            <ServerRail />
          </Suspense>
        </div>
        <div className="flex min-w-0 flex-1">
          <Suspense fallback={<Loading />}>{children}</Suspense>
        </div>
      </div>
    </div>
  );
}
