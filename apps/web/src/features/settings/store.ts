import {
  settingsDensitySchema,
  settingsFontSizeSchema,
  settingsThemeSchema,
  USER_SETTINGS_DEFAULTS,
  type SettingsDensity,
  type SettingsFontSize,
  type SettingsTheme,
} from '@ping/shared';
import { create } from 'zustand';

/** Khởi tạo từ cache localStorage của thiết bị để không nháy sáng rồi tối khi tab mới tải. */
interface AppliedSettingsState {
  theme: SettingsTheme;
  density: SettingsDensity;
  fontSize: SettingsFontSize;
  apply: (partial: Partial<Omit<AppliedSettingsState, 'apply'>>) => void;
}

const CACHE_KEY = 'ping.settings.applied';

interface CachedSettings {
  theme: SettingsTheme;
  density: SettingsDensity;
  fontSize: SettingsFontSize;
}

function readCache(): Partial<CachedSettings> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Partial<CachedSettings> = {};
    const theme = settingsThemeSchema.safeParse(parsed.theme);
    const density = settingsDensitySchema.safeParse(parsed.density);
    const fontSize = settingsFontSizeSchema.safeParse(parsed.fontSize);
    if (theme.success) out.theme = theme.data;
    if (density.success) out.density = density.data;
    if (fontSize.success) out.fontSize = fontSize.data;
    return out;
  } catch {
    return {};
  }
}

function writeCache(partial: Partial<CachedSettings>): void {
  if (typeof window === 'undefined') return;
  try {
    const current = readCache();
    window.localStorage.setItem(CACHE_KEY, JSON.stringify({ ...current, ...partial }));
  } catch {
    // localStorage bị chặn: bỏ qua.
  }
}

const cached = readCache();

export const useAppliedSettings = create<AppliedSettingsState>((set) => ({
  theme: cached.theme ?? USER_SETTINGS_DEFAULTS.theme,
  density: cached.density ?? USER_SETTINGS_DEFAULTS.density,
  fontSize: cached.fontSize ?? USER_SETTINGS_DEFAULTS.fontSize,
  apply: (partial) => {
    writeCache(partial);
    set(partial);
  },
}));
