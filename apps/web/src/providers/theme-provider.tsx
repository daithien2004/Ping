'use client';

import { ConfigProvider, App as AntdApp } from 'antd';
import enUS from 'antd/locale/en_US';
import viVN from 'antd/locale/vi_VN';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLocale } from 'use-intl';
import { PingToastHost } from '@/components/ui/ping-toast';
import { useAppliedSettings } from '@/features/settings/store';
import { buildAntdTheme, type ThemeMode } from '@/lib/theme';

function detectOsDark(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useAppliedSettings((state) => state.theme);
  const density = useAppliedSettings((state) => state.density);
  const fontSize = useAppliedSettings((state) => state.fontSize);
  const locale = useLocale();
  const [osDark, setOsDark] = useState(detectOsDark);

  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setOsDark(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    root.setAttribute('data-density', density);
    root.setAttribute('data-font', fontSize);
  }, [theme, density, fontSize]);

  const mode: ThemeMode = theme === 'system' ? (osDark ? 'dark' : 'light') : theme;
  const themeConfig = useMemo(() => buildAntdTheme(mode), [mode]);

  return (
    <ConfigProvider theme={themeConfig} locale={locale === 'en' ? enUS : viVN}>
      <AntdApp>
        <PingToastHost />
        {children}
      </AntdApp>
    </ConfigProvider>
  );
}
