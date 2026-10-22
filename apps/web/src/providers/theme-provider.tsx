'use client';

import { ConfigProvider, App as AntdApp } from 'antd';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { buildAntdTheme, cssVariables, type ThemeMode } from '@/lib/theme';

function detectMode(): ThemeMode {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [mode, setMode] = useState<ThemeMode>(detectMode);

  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setMode(e.matches ? 'dark' : 'light');
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  const theme = useMemo(() => buildAntdTheme(mode), [mode]);
  const vars = useMemo(() => cssVariables(mode), [mode]);

  return (
    <ConfigProvider theme={theme}>
      <AntdApp>
        <div style={vars as React.CSSProperties} data-theme={mode}>
          {children}
        </div>
      </AntdApp>
    </ConfigProvider>
  );
}
