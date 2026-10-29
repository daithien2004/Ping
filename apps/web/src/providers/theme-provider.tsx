'use client';

import { ConfigProvider, App as AntdApp } from 'antd';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { PingToastHost } from '@/components/ui/ping-toast';
import { useAppliedSettings } from '@/features/settings/store';
import { buildAntdTheme, cssVariables, type ThemeMode } from '@/lib/theme';

function detectOsDark(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

/**
 * Theme của antd + ba thuộc tính cài đặt giao diện trên <html> (TG.13):
 * - `data-theme`: 'dark' buộc tối, 'light' buộc sáng, 'system' theo hệ điều hành — CSS
 *   (globals.css) quyết định từ attr này; antd cần mode hiệu dụng nên resolve tại đây.
 * - `data-density`/`data-font`: mật độ tin nhắn + cỡ chữ gốc (biến CSS tương ứng).
 * Nguồn là store cài đặt đang áp dụng; SettingsSync bơm giá trị server vào store sau khi
 * đăng nhập — chưa đăng nhập store giữ mặc định ('system'/'comfortable'/'md'), app vẽ như cũ.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const theme = useAppliedSettings((state) => state.theme);
  const density = useAppliedSettings((state) => state.density);
  const fontSize = useAppliedSettings((state) => state.fontSize);
  const [osDark, setOsDark] = useState(detectOsDark);

  useEffect(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = (e: MediaQueryListEvent) => setOsDark(e.matches);
    mql.addEventListener('change', handler);
    return () => mql.removeEventListener('change', handler);
  }, []);

  // Đồng bộ với bên ngoài (DOM): CSS đọc data-theme/density/font, React không thấy được.
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme', theme);
    root.setAttribute('data-density', density);
    root.setAttribute('data-font', fontSize);
  }, [theme, density, fontSize]);

  const mode: ThemeMode = theme === 'system' ? (osDark ? 'dark' : 'light') : theme;
  const themeConfig = useMemo(() => buildAntdTheme(mode), [mode]);
  const vars = useMemo(() => cssVariables(mode), [mode]);

  return (
    <ConfigProvider theme={themeConfig}>
      <AntdApp>
        <PingToastHost />
        <div style={vars as React.CSSProperties}>{children}</div>
      </AntdApp>
    </ConfigProvider>
  );
}
