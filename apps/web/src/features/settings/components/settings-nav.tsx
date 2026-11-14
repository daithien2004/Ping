'use client';

import { Bell, Keyboard, Languages, Palette, Shield, User } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useTranslations } from 'use-intl';

export const SETTINGS_ITEMS = [
  { href: '/settings', key: 'account', icon: User },
  { href: '/settings/appearance', key: 'appearance', icon: Palette },
  { href: '/settings/language', key: 'language', icon: Languages },
  { href: '/settings/notifications', key: 'notifications', icon: Bell },
  { href: '/settings/privacy', key: 'privacy', icon: Shield },
  { href: '/settings/shortcuts', key: 'shortcuts', icon: Keyboard },
] as const;

export function SettingsNav() {
  const pathname = usePathname();
  const t = useTranslations('settings');
  return (
    <nav
      aria-label={t('navLabel')}
      data-slot="settings-nav"
      className="flex w-full shrink-0 gap-1 overflow-x-auto border-b border-border bg-sidebar p-2 md:w-settings-nav md:flex-col md:overflow-visible md:border-0 md:p-2.5"
    >
      {SETTINGS_ITEMS.map(({ href, key, icon: Icon }) => {
        const active = key === 'account' ? pathname === '/settings' : pathname.startsWith(href);
        return (
          <Link
            key={key}
            href={href}
            aria-current={active ? 'page' : undefined}
            data-testid={`settings-nav-${key}`}
            className={`group flex h-8 shrink-0 items-center rounded-md px-2 whitespace-nowrap transition-colors focus-ring ${
              active ? 'bg-accent' : 'hover:bg-accent/50'
            }`}
          >
            {/* Màu ở span con: antd tô <a> bằng rule ngoài layer nên class `text-*` trên Link bị đè. */}
            <span
              className={`flex items-center gap-2 text-base font-medium ${
                active
                  ? 'text-accent-foreground'
                  : 'text-muted-foreground group-hover:text-foreground'
              }`}
            >
              <Icon className="size-5 shrink-0" aria-hidden />
              {t(`sections.${key}`)}
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
