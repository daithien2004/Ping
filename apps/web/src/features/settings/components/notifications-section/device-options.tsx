import { useState } from 'react';
import { useTranslations } from 'use-intl';
import { PingSwitch } from '@/components/ui/ping-switch';
import {
  readIgnoreEveryone,
  readSoundEnabled,
  writeIgnoreEveryone,
  writeSoundEnabled,
} from '@/features/notifications/notify-storage';

/** Hai toggle cài đặt THIẾT BỊ gom từ chuông kênh/popover TG.12 về trang cài đặt. */
export function DeviceOptions() {
  const t = useTranslations('settings.notifications');
  // localStorage chỉ đọc ở client — khởi tạo qua lazy initializer (component này chỉ client).
  const [ignoreEveryone, setIgnoreEveryone] = useState(readIgnoreEveryone);
  const [sound, setSound] = useState(readSoundEnabled);
  return (
    <section aria-label={t('deviceSection')} className="flex flex-col divide-y divide-border">
      <div className="flex items-center justify-between gap-4 py-3">
        <div className="flex flex-col">
          <span className="text-sm font-medium" id="settings-ignore-everyone-label">
            {t('ignoreEveryone')}
          </span>
          <p className="text-xs text-muted-foreground">{t('ignoreEveryoneHint')}</p>
        </div>
        <PingSwitch
          size="sm"
          checked={ignoreEveryone}
          aria-labelledby="settings-ignore-everyone-label"
          data-testid="settings-ignore-everyone"
          onChange={(value) => {
            setIgnoreEveryone(value);
            writeIgnoreEveryone(value);
          }}
        />
      </div>
      <div className="flex items-center justify-between gap-4 py-3">
        <div className="flex flex-col">
          <span className="text-sm font-medium" id="settings-sound-label">
            {t('sound')}
          </span>
          <p className="text-xs text-muted-foreground">{t('soundHint')}</p>
        </div>
        <PingSwitch
          size="sm"
          checked={sound}
          aria-labelledby="settings-sound-label"
          data-testid="settings-sound"
          onChange={(value) => {
            setSound(value);
            writeSoundEnabled(value);
          }}
        />
      </div>
    </section>
  );
}
