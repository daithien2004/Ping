'use client';

import { Bell, Keyboard, Languages, Palette, Shield, User } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'use-intl';

/** Các mục cài đặt (TG.13) — /settings là mục Tài khoản, còn lại là route con. */
const ITEMS = [
  { href: '/settings', key: 'account', icon: User },
  { href: '/settings/appearance', key: 'appearance', icon: Palette },
  { href: '/settings/language', key: 'language', icon: Languages },
  { href: '/settings/notifications', key: 'notifications', icon: Bell },
  { href: '/settings/privacy', key: 'privacy', icon: Shield },
  { href: '/settings/shortcuts', key: 'shortcuts', icon: Keyboard },
] as const;

/**
 * Nav mục cài đặt: role="navigation" + aria-current="page" (a11y), nền token theo nghĩa.
 * Dùng usePathname (được phép: là component layout, không phải page — ADR-0020).
 */
export function SettingsNav() {
  const pathname = usePathname();
  const t = useTranslations('settings');
  return (
    <nav
      aria-label={t('navLabel')}
      className="flex w-56 shrink-0 flex-col gap-1 border-r border-border p-4"
    >
      {ITEMS.map(({ href, key, icon: Icon }) => {
        const active = key === 'account' ? pathname === '/settings' : pathname.startsWith(href);
        return (
          <Link
            key={key}
            href={href}
            aria-current={active ? 'page' : undefined}
            data-testid={`settings-nav-${key}`}
            className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors ${
              active
                ? 'bg-accent font-medium text-accent-foreground'
                : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
            }`}
          >
            <Icon className="size-4 shrink-0" aria-hidden />
            {t(`sections.${key}`)}
          </Link>
        );
      })}
    </nav>
  );
}
