'use client';

import { useEffect } from 'react';
import { useUserSettings } from '../hooks';
import { useAppliedSettings } from '../store';

/** Locale KHÔNG áp dụng ở đây: i18n đọc cookie lúc server render. */
export function SettingsSync() {
  const { data } = useUserSettings();
  const apply = useAppliedSettings((state) => state.apply);

  useEffect(() => {
    if (!data) return;
    apply({ theme: data.theme, density: data.density, fontSize: data.fontSize });
  }, [data, apply]);

  return null;
}
