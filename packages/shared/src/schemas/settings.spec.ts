import { describe, expect, it } from 'vitest';
import { settingsDensitySchema, settingsThemeSchema, updateUserSettingsSchema } from './settings';

describe('user settings (TG.13)', () => {
  it('theme/density chỉ nhận giá trị liệt kê', () => {
    for (const theme of SETTINGS_THEMES_SAFE) {
      expect(settingsThemeSchema.safeParse(theme).success).toBe(true);
    }
    expect(settingsThemeSchema.safeParse('blue').success).toBe(false);
    expect(settingsDensitySchema.safeParse('compact').success).toBe(true);
    expect(settingsDensitySchema.safeParse('dense').success).toBe(false);
  });

  it('PATCH semantics: rỗng bị chặn, một trường là đủ', () => {
    expect(updateUserSettingsSchema.safeParse({}).success).toBe(false);
    expect(updateUserSettingsSchema.safeParse({ theme: 'dark' }).success).toBe(true);
    expect(updateUserSettingsSchema.safeParse({ locale: 'vi', fontSize: 'lg' }).success).toBe(true);
    expect(updateUserSettingsSchema.safeParse({ theme: 'hệ thống' }).success).toBe(false);
  });
});

const SETTINGS_THEMES_SAFE = ['light', 'dark', 'system'] as const;
