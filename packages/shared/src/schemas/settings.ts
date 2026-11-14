import { z } from 'zod';

/** PATCH: trường không gửi giữ nguyên. */
export const SETTINGS_THEMES = ['light', 'dark', 'system'] as const;
export type SettingsTheme = (typeof SETTINGS_THEMES)[number];
export const settingsThemeSchema = z.enum(SETTINGS_THEMES);

export const SETTINGS_DENSITIES = ['comfortable', 'compact'] as const;
export type SettingsDensity = (typeof SETTINGS_DENSITIES)[number];
export const settingsDensitySchema = z.enum(SETTINGS_DENSITIES);

export const SETTINGS_FONT_SIZES = ['sm', 'md', 'lg'] as const;
export type SettingsFontSize = (typeof SETTINGS_FONT_SIZES)[number];
export const settingsFontSizeSchema = z.enum(SETTINGS_FONT_SIZES);

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

/** Nguồn duy nhất cho DEFAULT trong schema.prisma, GET lazy và store web; đổi giá trị = sửa đây + migration expand. */
export const USER_SETTINGS_DEFAULTS = {
  theme: 'system',
  density: 'comfortable',
  fontSize: 'md',
  locale: 'vi',
} as const satisfies UserSettingsDto;

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
