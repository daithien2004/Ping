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

/**
 * Bản cài đặt ĐANG ÁP DỤNG trên thiết bị này (TG.13) — UI state, không phải server state:
 * server state nằm trong cache TanStack (`qk.settings`), store này để ThemeProvider (root
 * layout, có cả khi chưa đăng nhập) và các nơi cần giá trị tức thời đọc.
 *
 * Nguồn khởi tạo: cache localStorage của THIẾT BỊ (ghi mỗi lần apply) — người dùng tối mở
 * tab mới thấy tối ngay, không đợi GET settings về mới đổi màu (tránh nháy sáng rồi tối).
 * Giá trị server vẫn là nguồn sự thật: SettingsSync bơm sau khi đăng nhập, lệch thì sửa lại.
 * Chưa đăng nhập/lần đầu trên máy: mặc định trùng mặc định server ('system'/'comfortable'/'md').
 */
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

/** Đọc cache thiết bị, chỉ nhận giá trị hợp lệ theo schema shared (localStorage có thể bị tay chỉnh). */
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
    // localStorage bị chặn hoặc JSON hỏng: bỏ qua cache, dùng mặc định.
    return {};
  }
}

function writeCache(partial: Partial<CachedSettings>): void {
  if (typeof window === 'undefined') return;
  try {
    const current = readCache();
    window.localStorage.setItem(CACHE_KEY, JSON.stringify({ ...current, ...partial }));
  } catch {
    // Không ghi được (người dùng tắt storage): cài đặt chỉ sống trong phiên, không nổi lỗi.
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
