import { z } from 'zod';

/**
 * TG.13: cài đặt người dùng lưu phía API (một hàng mỗi user) — áp dụng ngay và đồng bộ mọi
 * thiết bị. PATCH semantics: gửi trường nào đổi trường nào; trường không gửi giữ nguyên.
 * Âm thanh/quyền Notification của TG.12 là thiết bị-riêng (localStorage), KHÔNG nằm đây.
 */
export const SETTINGS_THEMES = ['light', 'dark', 'system'] as const;
export type SettingsTheme = (typeof SETTINGS_THEMES)[number];
export const settingsThemeSchema = z.enum(SETTINGS_THEMES);

/** Mật độ tin nhắn: thoáng (mặc định hiện tại) / gọn (mật độ cao hơn). */
export const SETTINGS_DENSITIES = ['comfortable', 'compact'] as const;
export type SettingsDensity = (typeof SETTINGS_DENSITIES)[number];
export const settingsDensitySchema = z.enum(SETTINGS_DENSITIES);

/** Cỡ chữ cơ sở của giao diện (CSS var); tin nhắn kế thừa. */
export const SETTINGS_FONT_SIZES = ['sm', 'md', 'lg'] as const;
export type SettingsFontSize = (typeof SETTINGS_FONT_SIZES)[number];
export const settingsFontSizeSchema = z.enum(SETTINGS_FONT_SIZES);

/** Ngôn ngữ giao diện — khớp i18n.config (cookie hiện có, settings đồng bộ lên server). */
export const SETTINGS_LOCALES = ['vi', 'en'] as const;
export type SettingsLocale = (typeof SETTINGS_LOCALES)[number];
export const settingsLocaleSchema = z.enum(SETTINGS_LOCALES);

export const updateUserSettingsSchema = z
  .object({
    theme: settingsThemeSchema.optional(),
    density: settingsDensitySchema.optional(),
    fontSize: settingsFontSizeSchema.optional(),
    locale: settingsLocaleSchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0, { message: 'nothing to update' });
export type UpdateUserSettingsInput = z.infer<typeof updateUserSettingsSchema>;

export interface UserSettingsDto {
  theme: SettingsTheme;
  density: SettingsDensity;
  fontSize: SettingsFontSize;
  locale: SettingsLocale;
}

/** TG.13 — Riêng tư: danh sách người tôi đã chặn (TG.9 lưu UserBlock, TG.13 bổ sung liệt kê). */
export interface BlockedUserDto {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  blockedAt: string;
}

export interface BlockedUsersResponse {
  blocked: BlockedUserDto[];
}
