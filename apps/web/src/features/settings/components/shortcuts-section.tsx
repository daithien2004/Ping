'use client';

import { useTranslations } from 'use-intl';
import { PingKbd } from '@/components/ui/ping-kbd';
import { SettingsSection } from './settings-section';

/**
 * Phím tắt (TG.13) — bảng TĨNH, chỉ liệt kê những tổ hợp thực sự xử lý trong code:
 * composer (message-composer.tsx: Enter/Shift+Enter/mũi tên/Tab/Esc cho gợi ý emoji) và
 * quick switcher + hộp thoại (Ctrl/Cmd+K, Esc). Không chế phím chưa có.
 */
const ROWS = [
  { keys: ['Enter'], action: 'send' },
  { keys: ['Shift', 'Enter'], action: 'newline' },
  { keys: ['Ctrl/Cmd', 'K'], action: 'quickSwitcher' },
  { keys: ['Esc'], action: 'closeDialog' },
  { keys: ['↑', '↓'], action: 'suggestNavigate' },
  { keys: ['Enter', 'Tab'], action: 'suggestAccept' },
  { keys: ['Esc'], action: 'suggestCancel' },
] as const;

export function ShortcutsSection() {
  const t = useTranslations('settings.shortcuts');
  return (
    <SettingsSection title={t('title')} hint={t('hint')} testId="settings-shortcuts">
      <table className="w-full max-w-2xl text-left text-sm">
        <caption className="sr-only">{t('title')}</caption>
        <thead>
          <tr className="border-b border-border text-xs text-muted-foreground">
            <th scope="col" className="py-2 pr-4 font-medium">
              {t('columnShortcut')}
            </th>
            <th scope="col" className="py-2 font-medium">
              {t('columnAction')}
            </th>
          </tr>
        </thead>
        <tbody>
          {ROWS.map((row) => (
            <tr key={row.action} className="border-b border-border/60">
              <td className="py-2.5 pr-4">
                <span className="flex flex-wrap items-center gap-1">
                  {row.keys.map((key) => (
                    <PingKbd key={key}>{key}</PingKbd>
                  ))}
                </span>
              </td>
              <td className="py-2.5">{t(row.action)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </SettingsSection>
  );
}
