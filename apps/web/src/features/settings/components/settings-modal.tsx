'use client';

import type { ComponentType } from 'react';
import { useTranslations } from 'use-intl';
import { PingModal } from '@/components/ui/ping-modal';
import { useSettingsModal, type SettingsSectionKey } from '../modal-store';
import { AccountSection } from './account-section';
import { AppearanceSection } from './appearance-section';
import { LanguageSection } from './language-section';
import { NotificationsSection } from './notifications-section';
import { PrivacySection } from './privacy-section';
import { SETTINGS_ITEMS } from './settings-nav';
import { ShortcutsSection } from './shortcuts-section';

const SECTIONS: Record<SettingsSectionKey, ComponentType> = {
  account: AccountSection,
  appearance: AppearanceSection,
  language: LanguageSection,
  notifications: NotificationsSection,
  privacy: PrivacySection,
  shortcuts: ShortcutsSection,
};

export function SettingsModal() {
  const { open, section, setSection, close } = useSettingsModal();
  const t = useTranslations('settings');
  const Active = SECTIONS[section];

  return (
    <PingModal
      title={t('modalTitle')}
      open={open}
      onCancel={close}
      footer={null}
      centered
      width="min(92vw, 60rem)"
      destroyOnHidden
      styles={{ body: { padding: 0 } }}
    >
      <div className="flex h-[min(72vh,38rem)] overflow-hidden max-md:h-[min(68vh,40rem)] max-md:flex-col">
        <nav
          aria-label={t('navLabel')}
          data-slot="settings-modal-nav"
          className="flex w-52 shrink-0 flex-col gap-1 overflow-y-auto border-r border-border p-2 max-md:w-full max-md:flex-row max-md:border-r-0 max-md:border-b"
        >
          {SETTINGS_ITEMS.map(({ key, icon: Icon }) => {
            const active = key === section;
            return (
              <button
                key={key}
                type="button"
                aria-current={active ? 'page' : undefined}
                data-testid={`settings-modal-nav-${key}`}
                onClick={() => setSection(key)}
                className={`flex h-8 shrink-0 items-center gap-2 rounded-md px-2 text-base font-medium whitespace-nowrap transition-colors focus-ring ${
                  active
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                }`}
              >
                <Icon className="size-5 shrink-0" aria-hidden />
                {t(`sections.${key}`)}
              </button>
            );
          })}
        </nav>
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <Active />
        </div>
      </div>
    </PingModal>
  );
}
