import {
  updateUserSettingsSchema,
  type UpdateUserSettingsInput,
  type UserSettingsDto,
} from '@ping/shared';
import { z } from 'zod';
import { api } from '@/lib/api-client';

/**
 * TG.13: validator chạy-time cho cài đặt người dùng. Shared giữ interface/schema nguồn sự
 * thật; shape trả về của API được parse zod tại biên như hướng dẫn 12.2 (mẫu của
 * features/dms/api.ts) — enum dựng TỪ atom của shared, không định nghĩa lại ngữ nghĩa.
 */
const userSettingsSchema: z.ZodType<UserSettingsDto> = z.object({
  theme: z.enum(['light', 'dark', 'system']),
  density: z.enum(['comfortable', 'compact']),
  fontSize: z.enum(['sm', 'md', 'lg']),
  locale: z.enum(['vi', 'en']),
});

/** GET /users/me/settings — lazy default: chưa có hàng API trả DTO mặc định. */
export const getSettings = (): Promise<UserSettingsDto> =>
  api.get<UserSettingsDto>('/users/me/settings', userSettingsSchema);

/** PATCH /users/me/settings — PATCH semantics (gửi trường nào đổi trường đó), trả DTO đầy đủ. */
export const patchSettings = (input: UpdateUserSettingsInput): Promise<UserSettingsDto> =>
  api.patch<UserSettingsDto>(
    '/users/me/settings',
    updateUserSettingsSchema.parse(input),
    userSettingsSchema,
  );
